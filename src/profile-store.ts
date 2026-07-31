import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  realpath,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Document,
} from 'yaml';
import type {
  ProfileEditor,
  ProfileWorkspace,
  PositioningProposal,
  SaveCvRequest,
  SaveProfileRequest,
  VerificationItem,
  VerificationStatus,
} from './contracts';

const PROFILE_PATH = 'config/profile.yml';
const CV_PATH = 'cv.md';
const MAX_PROFILE_BYTES = 1_000_000;
const MAX_CV_BYTES = 1_000_000;
const MAX_TEXT_LENGTH = 8_000;
const MAX_CV_LENGTH = 900_000;
const VERIFICATION_STATUSES = new Set<VerificationStatus>([
  'verified',
  'unverified',
  'needs_review',
]);

export class RevisionConflictError extends Error {
  constructor(relativePath: string) {
    super(`${relativePath} 已在磁盘上被其他进程修改。请重新读取后再保存。`);
    this.name = 'RevisionConflictError';
  }
}

type PendingWrite = {
  relativePath: typeof PROFILE_PATH | typeof CV_PATH;
  expectedRevision: string;
  nextContent: string;
  maxBytes: number;
};

type BackupManifest = {
  createdAt: string;
  reason: string;
  files: Array<{
    relativePath: string;
    revision: string;
    bytes: number;
  }>;
};

function stringValue(value: unknown): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : '';
}

function stringArray(value: unknown): string[] {
  const values = isSeq(value) ? value.items : Array.isArray(value) ? value : [];
  return values
    .map((item) => (isScalar(item) ? stringValue(item.value) : stringValue(item)))
    .map((item) => item.trim())
    .filter(Boolean);
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function get(document: Document, pathSegments: Array<string | number>): unknown {
  return document.getIn(pathSegments);
}

function assertText(value: unknown, label: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string') throw new Error(`${label} 必须是文本。`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${label} 内容过长。`);
  if (normalized.includes('\u0000')) throw new Error(`${label} 包含无效字符。`);
  return normalized;
}

function assertList(value: unknown, label: string, maxItems = 30): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`${label} 格式无效或项目过多。`);
  }
  const normalized = value.map((item, index) => assertText(item, `${label} ${index + 1}`, 300));
  return [...new Set(normalized.filter(Boolean))];
}

function validateProfileEditor(input: ProfileEditor): ProfileEditor {
  if (!input || typeof input !== 'object') throw new Error('个人资料格式无效。');
  const age = Number(input.maxPostingAgeDays);
  if (!Number.isInteger(age) || age < 1 || age > 365) {
    throw new Error('岗位发布时间范围必须是 1 到 365 天。');
  }
  return {
    fullName: assertText(input.fullName, '姓名', 200),
    email: assertText(input.email, '邮箱', 320),
    phone: assertText(input.phone, '电话', 100),
    location: assertText(input.location, '当前地点', 300),
    headline: assertText(input.headline, '职业定位', 300),
    targetRoles: assertList(input.targetRoles, '目标岗位'),
    country: assertText(input.country, '国家', 120),
    city: assertText(input.city, '城市', 120),
    timezone: assertText(input.timezone, '时区', 120),
    compensationTargetRange: assertText(input.compensationTargetRange, '目标薪资', 200),
    compensationCurrency: assertText(input.compensationCurrency, '薪资币种', 12),
    compensationMinimum: assertText(input.compensationMinimum, '最低薪资', 200),
    locationFlexibility: assertText(input.locationFlexibility, '地点灵活性', 500),
    preferredRegions: assertList(input.preferredRegions, '偏好地区'),
    workArrangements: assertList(input.workArrangements, '工作方式'),
    employmentTypes: assertList(input.employmentTypes, '工作类型'),
    maxPostingAgeDays: age,
    otherRequirements: assertList(input.otherRequirements, '其他要求'),
    automaticSubmission: false,
  };
}

function validateVerificationItems(items: VerificationItem[]): VerificationItem[] {
  if (!Array.isArray(items) || items.length > 250) {
    throw new Error('事实验证记录格式无效或项目过多。');
  }
  const seen = new Set<string>();
  return items.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`事实验证记录 ${index + 1} 格式无效。`);
    const id = assertText(item.id, `事实 ID ${index + 1}`, 160);
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id) || seen.has(id)) {
      throw new Error(`事实 ID ${id || index + 1} 无效或重复。`);
    }
    seen.add(id);
    if (!VERIFICATION_STATUSES.has(item.status)) {
      throw new Error(`事实 ${id} 的验证状态无效。`);
    }
    return {
      id,
      label: assertText(item.label, `事实 ${id} 名称`, 240),
      category: assertText(item.category, `事实 ${id} 分类`, 120),
      source: assertText(item.source, `事实 ${id} 来源`, 400),
      status: item.status,
      evidence: assertText(item.evidence, `事实 ${id} 证据`, 1_000),
      note: assertText(item.note, `事实 ${id} 备注`, 1_000),
    };
  });
}

function parseYaml(content: string): Document {
  const document = parseDocument(content, {
    keepSourceTokens: true,
    prettyErrors: true,
    strict: true,
  });
  if (document.errors.length) {
    throw new Error(`config/profile.yml 无法解析：${document.errors[0].message}`);
  }
  return document;
}

export function revisionForContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function parseProfileWorkspace(content: string): ProfileWorkspace {
  const document = parseYaml(content);
  const editor: ProfileEditor = {
    fullName: stringValue(get(document, ['candidate', 'full_name'])),
    email: stringValue(get(document, ['candidate', 'email'])),
    phone: stringValue(get(document, ['candidate', 'phone'])),
    location: stringValue(get(document, ['candidate', 'location'])),
    headline: stringValue(get(document, ['narrative', 'headline'])),
    targetRoles: stringArray(get(document, ['target_roles', 'primary'])),
    country: stringValue(get(document, ['location', 'country'])),
    city: stringValue(get(document, ['location', 'city'])),
    timezone: stringValue(get(document, ['location', 'timezone'])),
    compensationTargetRange: stringValue(get(document, ['compensation', 'target_range'])),
    compensationCurrency: stringValue(get(document, ['compensation', 'currency'])),
    compensationMinimum: stringValue(get(document, ['compensation', 'minimum'])),
    locationFlexibility: stringValue(get(document, ['compensation', 'location_flexibility'])),
    preferredRegions: stringArray(get(document, ['work_preferences', 'preferred_regions'])),
    workArrangements: stringArray(get(document, ['work_preferences', 'arrangements'])),
    employmentTypes: stringArray(get(document, ['work_preferences', 'employment_types'])),
    maxPostingAgeDays: numberValue(get(document, ['work_preferences', 'max_posting_age_days']), 14),
    otherRequirements: stringArray(get(document, ['work_preferences', 'other_requirements'])),
    automaticSubmission: booleanValue(get(document, ['work_preferences', 'automatic_submission'])),
  };

  const verification: VerificationItem[] = [];
  const items = document.getIn(['fact_verification', 'items'], true);
  if (isMap(items)) {
    for (const pair of items.items) {
      const id = isScalar(pair.key) ? stringValue(pair.key.value) : stringValue(pair.key);
      if (!id || !isMap(pair.value)) continue;
      const statusCandidate = stringValue(pair.value.get('status'));
      const status = VERIFICATION_STATUSES.has(statusCandidate as VerificationStatus)
        ? statusCandidate as VerificationStatus
        : 'needs_review';
      verification.push({
        id,
        label: stringValue(pair.value.get('label')) || id,
        category: stringValue(pair.value.get('category')) || '其他',
        source: stringValue(pair.value.get('source')),
        status,
        evidence: stringValue(pair.value.get('evidence')),
        note: stringValue(pair.value.get('note')),
      });
    }
  }

  return {
    editor,
    verification,
    migration: {
      state: stringValue(get(document, ['fact_verification', 'migration', 'state'])),
      sourceLabel: stringValue(get(document, ['fact_verification', 'migration', 'source_label'])),
      sourceUpdatedAt: stringValue(get(document, ['fact_verification', 'migration', 'source_updated_at'])),
      migratedAt: stringValue(get(document, ['fact_verification', 'migration', 'migrated_at'])),
      runtimeDisconnected: booleanValue(
        get(document, ['fact_verification', 'migration', 'runtime_disconnected']),
      ),
    },
  };
}

function profileContentWithEdits(
  currentContent: string,
  profileInput: ProfileEditor,
  verificationInput: VerificationItem[],
): string {
  const profile = validateProfileEditor(profileInput);
  const verification = validateVerificationItems(verificationInput);
  const document = parseYaml(currentContent);

  document.setIn(['candidate', 'full_name'], profile.fullName);
  document.setIn(['candidate', 'email'], profile.email);
  document.setIn(['candidate', 'phone'], profile.phone);
  document.setIn(['candidate', 'location'], profile.location);
  document.setIn(['narrative', 'headline'], profile.headline);
  document.setIn(['target_roles', 'primary'], profile.targetRoles);
  document.setIn(['location', 'country'], profile.country);
  document.setIn(['location', 'city'], profile.city);
  document.setIn(['location', 'timezone'], profile.timezone);
  document.setIn(['compensation', 'target_range'], profile.compensationTargetRange);
  document.setIn(['compensation', 'currency'], profile.compensationCurrency);
  document.setIn(['compensation', 'minimum'], profile.compensationMinimum);
  document.setIn(['compensation', 'location_flexibility'], profile.locationFlexibility);
  document.setIn(['work_preferences', 'preferred_regions'], profile.preferredRegions);
  document.setIn(['work_preferences', 'arrangements'], profile.workArrangements);
  document.setIn(['work_preferences', 'employment_types'], profile.employmentTypes);
  document.setIn(['work_preferences', 'max_posting_age_days'], profile.maxPostingAgeDays);
  document.setIn(['work_preferences', 'other_requirements'], profile.otherRequirements);
  document.setIn(['work_preferences', 'automatic_submission'], profile.automaticSubmission);

  const itemsRecord = Object.fromEntries(verification.map((item) => [
    item.id,
    {
      label: item.label,
      category: item.category,
      source: item.source,
      status: item.status,
      evidence: item.evidence,
      note: item.note,
    },
  ]));
  document.setIn(['fact_verification', 'items'], itemsRecord);
  return document.toString({ lineWidth: 0 });
}

async function safeTarget(
  root: string,
  relativePath: typeof PROFILE_PATH | typeof CV_PATH,
): Promise<string> {
  const resolvedRoot = await realpath(root);
  const lexicalTarget = path.resolve(resolvedRoot, relativePath);
  const target = await realpath(lexicalTarget);
  const relative = path.relative(resolvedRoot, target);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('写入目标超出 career-ops 工作区。');
  }
  return target;
}

async function readCurrent(root: string, write: PendingWrite): Promise<Buffer> {
  const target = await safeTarget(root, write.relativePath);
  const info = await stat(target);
  if (!info.isFile() || info.size > write.maxBytes) {
    throw new Error(`${write.relativePath} 无法安全写入。`);
  }
  return readFile(target);
}

async function commitWrites(
  root: string,
  reason: string,
  writes: PendingWrite[],
): Promise<string> {
  const current = new Map<string, Buffer>();
  for (const write of writes) {
    const bytes = await readCurrent(root, write);
    if (revisionForContent(bytes) !== write.expectedRevision) {
      throw new RevisionConflictError(write.relativePath);
    }
    if (Buffer.byteLength(write.nextContent, 'utf8') > write.maxBytes) {
      throw new Error(`${write.relativePath} 保存内容过大。`);
    }
    current.set(write.relativePath, bytes);
  }

  const createdAt = new Date().toISOString();
  const backupDirectory = path.join(
    root,
    'data',
    'backups',
    'profile',
    `${createdAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
  );
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const manifest: BackupManifest = {
    createdAt,
    reason,
    files: [],
  };
  for (const write of writes) {
    const bytes = current.get(write.relativePath);
    if (!bytes) throw new Error(`无法备份 ${write.relativePath}。`);
    const backupName = write.relativePath.replaceAll(path.sep, '__');
    await writeFileAtomic(path.join(backupDirectory, backupName), bytes, {
      mode: 0o600,
      fsync: true,
    });
    manifest.files.push({
      relativePath: write.relativePath,
      revision: revisionForContent(bytes),
      bytes: bytes.length,
    });
  }
  await writeFileAtomic(
    path.join(backupDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600, fsync: true },
  );

  const committed: PendingWrite[] = [];
  try {
    for (const write of writes) {
      await writeFileAtomic(
        await safeTarget(root, write.relativePath),
        write.nextContent,
        { encoding: 'utf8', fsync: true },
      );
      committed.push(write);
    }
  } catch (error) {
    for (const write of committed.reverse()) {
      const previous = current.get(write.relativePath);
      if (previous) {
        await writeFileAtomic(
          await safeTarget(root, write.relativePath),
          previous,
          { fsync: true },
        );
      }
    }
    throw error;
  }
  return path.relative(root, backupDirectory);
}

export async function saveProfile(
  root: string,
  request: SaveProfileRequest,
): Promise<string> {
  if (!request || typeof request !== 'object') throw new Error('保存请求格式无效。');
  const expectedRevision = assertText(request.expectedRevision, 'Profile revision', 128);
  const target = await safeTarget(root, PROFILE_PATH);
  const currentContent = await readFile(target, 'utf8');
  const nextContent = profileContentWithEdits(
    currentContent,
    request.profile,
    request.verification,
  );
  return commitWrites(root, 'profile-edit', [{
    relativePath: PROFILE_PATH,
    expectedRevision,
    nextContent,
    maxBytes: MAX_PROFILE_BYTES,
  }]);
}

export async function saveCv(root: string, request: SaveCvRequest): Promise<string> {
  if (!request || typeof request !== 'object') throw new Error('保存请求格式无效。');
  const expectedRevision = assertText(request.expectedRevision, 'CV revision', 128);
  const content = assertText(request.content, 'CV', MAX_CV_LENGTH);
  if (!content.startsWith('# ')) throw new Error('cv.md 必须以一级标题开始。');
  return commitWrites(root, 'cv-edit', [{
    relativePath: CV_PATH,
    expectedRevision,
    nextContent: `${content}\n`,
    maxBytes: MAX_CV_BYTES,
  }]);
}

export async function confirmPositioning(
  root: string,
  expectedRevisionInput: string,
  analysisIdInput: string,
  proposal: PositioningProposal,
): Promise<string> {
  const expectedRevision = assertText(expectedRevisionInput, 'Profile revision', 128);
  const analysisId = assertText(analysisIdInput, 'Analysis ID', 128);
  if (!/^[a-f0-9]{64}$/.test(analysisId)) throw new Error('Analysis ID 无效。');
  const headline = assertText(proposal.headline, '定位标题', 180);
  const statement = assertText(proposal.statement, '定位陈述', 900);
  if (!Array.isArray(proposal.strengths) || proposal.strengths.length < 1 || proposal.strengths.length > 5) {
    throw new Error('定位优势必须包含 1 到 5 项。');
  }
  const strengths = proposal.strengths.map((item, index) => (
    assertText(item.text, `定位优势 ${index + 1}`, 240)
  ));
  const target = await safeTarget(root, PROFILE_PATH);
  const currentContent = await readFile(target, 'utf8');
  const document = parseYaml(currentContent);
  document.setIn(['narrative', 'headline'], headline);
  document.setIn(['narrative', 'exit_story'], statement);
  document.setIn(['narrative', 'superpowers'], strengths);
  document.setIn(['positioning_confirmation', 'analysis_id'], analysisId);
  document.setIn(['positioning_confirmation', 'confirmed_at'], new Date().toISOString());
  document.setIn(['positioning_confirmation', 'source'], 'competitiveness-analysis');
  return commitWrites(root, 'positioning-confirmation', [{
    relativePath: PROFILE_PATH,
    expectedRevision,
    nextContent: document.toString({ lineWidth: 0 }),
    maxBytes: MAX_PROFILE_BYTES,
  }]);
}
