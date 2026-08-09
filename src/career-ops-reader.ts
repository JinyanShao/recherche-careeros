import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isScalar, isSeq, parseDocument } from 'yaml';
import type {
  CareerOpsSnapshot,
  CareerOpsValidation,
  LocalDocument,
  PipelineJob,
  PipelineSnapshot,
  ProfileWorkspace,
  ProfileSummary,
  ReportDocument,
  ReportSummary,
  TrackerApplication,
  TrackerSnapshot,
  ValidationCheck,
} from './contracts';
import { parseProfileWorkspace } from './profile-store';

const MAX_DOCUMENT_BYTES = 1_000_000;
const MAX_PIPELINE_BYTES = 12_000_000;
const MAX_TRACKER_BYTES = 12_000_000;
const MAX_REPORT_BYTES = 2_000_000;
const REPORT_HEAD_BYTES = 24_000;

const REQUIRED_MARKERS = [
  { id: 'agent', label: 'career-ops system marker', relativePath: 'AGENTS.md', required: true },
  { id: 'scanner', label: 'career-ops scanner', relativePath: 'scan.mjs', required: true },
  { id: 'cv', label: 'CV source', relativePath: 'cv.md', required: true },
  { id: 'profile', label: 'Profile configuration', relativePath: 'config/profile.yml', required: true },
  { id: 'pipeline', label: 'Job pipeline', relativePath: 'data/pipeline.md', required: true },
  { id: 'tracker', label: 'Application tracker', relativePath: 'data/applications.md', required: false },
  { id: 'reports', label: 'Evaluation reports', relativePath: 'reports', required: false },
];

const EMPTY_PROFILE: ProfileSummary = {
  fullName: '',
  location: '',
  headline: '',
  targetRoles: [],
  outputLanguage: '',
  spendTier: '',
};

const EMPTY_PROFILE_WORKSPACE: ProfileWorkspace = {
  editor: {
    fullName: '',
    email: '',
    phone: '',
    location: '',
    headline: '',
    targetRoles: [],
    country: '',
    city: '',
    timezone: '',
    compensationTargetRange: '',
    compensationCurrency: '',
    compensationMinimum: '',
    locationFlexibility: '',
    preferredRegions: [],
    workArrangements: [],
    employmentTypes: [],
    maxPostingAgeDays: 14,
    otherRequirements: [],
    automaticSubmission: false,
  },
  verification: [],
  migration: {
    state: '',
    sourceLabel: '',
    sourceUpdatedAt: '',
    migratedAt: '',
    runtimeDisconnected: false,
  },
};

function cleanScalar(value: string): string {
  const withoutComment = value.replace(/\s+#.*$/, '').trim();
  if (
    (withoutComment.startsWith('"') && withoutComment.endsWith('"'))
    || (withoutComment.startsWith("'") && withoutComment.endsWith("'"))
  ) {
    return withoutComment.slice(1, -1);
  }
  return withoutComment;
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function resolveSafeExistingPath(root: string, relativePath: string): string | null {
  const candidate = path.resolve(root, relativePath);
  if (!isInsideRoot(root, candidate) || !existsSync(candidate)) return null;
  try {
    const resolved = realpathSync(candidate);
    return isInsideRoot(root, resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function readLocalDocument(root: string, relativePath: string, maxBytes: number): LocalDocument {
  const file = resolveSafeExistingPath(root, relativePath);
  if (!file) {
    return {
      relativePath,
      exists: false,
      content: '',
      bytes: 0,
      modifiedAt: null,
      revision: '',
    };
  }
  const info = statSync(file);
  if (!info.isFile()) {
    return {
      relativePath,
      exists: false,
      content: '',
      bytes: 0,
      modifiedAt: null,
      revision: '',
    };
  }
  if (info.size > maxBytes) {
    throw new Error(`${relativePath} is too large to display safely.`);
  }
  const content = readFileSync(file, 'utf8');
  return {
    relativePath,
    exists: true,
    content,
    bytes: info.size,
    modifiedAt: info.mtime.toISOString(),
    revision: createHash('sha256').update(content).digest('hex'),
  };
}

function checkMarker(root: string, marker: typeof REQUIRED_MARKERS[number]): ValidationCheck {
  const resolved = resolveSafeExistingPath(root, marker.relativePath);
  let present = false;
  if (resolved) {
    const info = statSync(resolved);
    present = marker.id === 'reports' ? info.isDirectory() : info.isFile();
  }
  return { ...marker, present };
}

export function validateCareerOpsRoot(inputRoot: string): CareerOpsValidation {
  let root = path.resolve(inputRoot || path.sep);
  const warnings: string[] = [];
  try {
    if (!existsSync(root) || !lstatSync(root).isDirectory()) {
      return {
        root,
        valid: false,
        checks: REQUIRED_MARKERS.map((marker) => ({ ...marker, present: false })),
        warnings: ['所选位置不是可读取的资料文件夹。'],
      };
    }
    root = realpathSync(root);
  } catch {
    return {
      root,
      valid: false,
      checks: REQUIRED_MARKERS.map((marker) => ({ ...marker, present: false })),
      warnings: ['无法读取所选资料文件夹。'],
    };
  }

  const checks = REQUIRED_MARKERS.map((marker) => checkMarker(root, marker));
  const missingOptional = checks.filter((check) => !check.required && !check.present);
  if (missingOptional.some((check) => check.id === 'tracker')) {
    warnings.push('还没有申请记录；完成第一次投递后会自动显示。');
  }
  if (missingOptional.some((check) => check.id === 'reports')) {
    warnings.push('还没有岗位报告；完成第一次岗位评估后会自动显示。');
  }
  return {
    root,
    valid: checks.every((check) => !check.required || check.present),
    checks,
    warnings,
  };
}

export function parseProfileSummary(content: string): ProfileSummary {
  if (!content.trim()) return { ...EMPTY_PROFILE };
  const document = parseDocument(content);
  if (document.errors.length) return { ...EMPTY_PROFILE, targetRoles: [] };
  const scalar = (segments: string[]): string => {
    const value = document.getIn(segments);
    return typeof value === 'string' || typeof value === 'number'
      ? cleanScalar(String(value))
      : '';
  };
  const roles = document.getIn(['target_roles', 'primary'], true);
  return {
    fullName: scalar(['candidate', 'full_name']),
    location: scalar(['candidate', 'location']),
    headline: scalar(['narrative', 'headline']),
    targetRoles: isSeq(roles)
      ? roles.items.map((item) => (isScalar(item) ? String(item.value) : '')).filter(Boolean)
      : [],
    outputLanguage: scalar(['language', 'output']),
    spendTier: scalar(['spend_tier']),
  };
}

function labelledPipelineValue(parts: string[], label: string): string {
  const part = parts.find((value) => value.toLowerCase().startsWith(`${label}:`));
  return part ? part.slice(part.indexOf(':') + 1).trim() : '';
}

export function parsePipeline(content: string): PipelineSnapshot {
  const jobs: PipelineJob[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/);
    if (!match) continue;
    const parts = match[2].split('|').map((part) => part.trim()).filter(Boolean);
    if (!parts[0]) continue;
    const positional = parts.filter((part, index) => (
      index < 3 || !/^(posted|trust|note):/i.test(part)
    ));
    const url = positional[0] ?? '';
    const idSeed = `${url}\u0000${positional[1] ?? ''}\u0000${positional[2] ?? ''}`;
    let hash = 2166136261;
    for (let index = 0; index < idSeed.length; index += 1) {
      hash ^= idSeed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    jobs.push({
      id: (hash >>> 0).toString(16).padStart(8, '0'),
      done: match[1].toLowerCase() === 'x',
      url,
      company: positional[1] ?? 'Unknown company',
      role: positional[2] ?? 'Untitled role',
      location: positional[3] ?? '',
      compensation: positional[4] ?? '',
      postedAt: labelledPipelineValue(parts, 'posted'),
      trust: labelledPipelineValue(parts, 'trust'),
    });
  }
  return {
    total: jobs.length,
    pending: jobs.filter((job) => !job.done).length,
    processed: jobs.filter((job) => job.done).length,
    jobs,
  };
}

function splitMarkdownRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return [];
  const body = trimmed.endsWith('|') ? trimmed.slice(1, -1) : trimmed.slice(1);
  return body.split('|').map((cell) => cell.trim());
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[*_#]/g, '').replace(/\s+/g, ' ').trim();
}

function headerIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => {
    // `#` is career-ops' canonical tracker-row column label. Keep it as a
    // structural marker before normalizing Markdown decoration away.
    if (aliases.includes('#') && header.trim() === '#') return true;
    return aliases.includes(normalizedHeader(header));
  });
}

function cell(row: string[], index: number): string {
  return index >= 0 && index < row.length ? row[index] : '';
}

export function parseTracker(content: string): TrackerSnapshot {
  const lines = content.split(/\r?\n/);
  const headerLine = lines.findIndex((line) => {
    const normalized = splitMarkdownRow(line).map(normalizedHeader);
    return normalized.includes('company') && normalized.includes('role') && normalized.includes('status');
  });
  if (headerLine < 0) return { total: 0, byStatus: {}, applications: [] };

  const headers = splitMarkdownRow(lines[headerLine]);
  const columns = {
    number: headerIndex(headers, ['#', 'num', 'number']),
    date: headerIndex(headers, ['date']),
    company: headerIndex(headers, ['company']),
    via: headerIndex(headers, ['via']),
    role: headerIndex(headers, ['role', 'position']),
    score: headerIndex(headers, ['score']),
    status: headerIndex(headers, ['status', 'state']),
    pdf: headerIndex(headers, ['pdf']),
    report: headerIndex(headers, ['report']),
    notes: headerIndex(headers, ['notes', 'note']),
  };
  const applications: TrackerApplication[] = [];

  for (const line of lines.slice(headerLine + 2)) {
    const row = splitMarkdownRow(line);
    if (!row.length || row.every((value) => !value)) continue;
    const company = cell(row, columns.company);
    const role = cell(row, columns.role);
    if (!company && !role) continue;
    applications.push({
      number: cell(row, columns.number),
      date: cell(row, columns.date),
      company,
      via: cell(row, columns.via),
      role,
      score: cell(row, columns.score),
      status: cell(row, columns.status),
      pdf: cell(row, columns.pdf),
      report: cell(row, columns.report),
      notes: cell(row, columns.notes),
    });
  }

  const byStatus = applications.reduce<Record<string, number>>((result, application) => {
    const status = application.status || 'Unknown';
    result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {});
  return { total: applications.length, byStatus, applications };
}

function reportField(content: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*(.+)$`, 'im'));
  return match?.[1]?.trim() ?? '';
}

function reportTitle(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback.replace(/\.md$/i, '').replace(/[-_]+/g, ' ');
}

export function listReports(root: string): ReportSummary[] {
  const reportsDir = resolveSafeExistingPath(root, 'reports');
  if (!reportsDir || !statSync(reportsDir).isDirectory()) return [];
  const summaries: ReportSummary[] = [];
  for (const name of readdirSync(reportsDir).filter((entry) => entry.endsWith('.md')).sort()) {
    const file = resolveSafeExistingPath(root, path.join('reports', name));
    if (!file) continue;
    const info = statSync(file);
    if (!info.isFile() || info.size > MAX_REPORT_BYTES) continue;
    const descriptor = readFileSync(file);
    const head = descriptor.subarray(0, REPORT_HEAD_BYTES).toString('utf8');
    summaries.push({
      name,
      title: reportTitle(head, name),
      company: reportField(head, 'Company'),
      role: reportField(head, 'Role'),
      score: reportField(head, 'Score'),
      modifiedAt: info.mtime.toISOString(),
      bytes: info.size,
    });
  }
  return summaries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function readReport(root: string, name: string): ReportDocument {
  if (
    typeof name !== 'string'
    || name.length === 0
    || name.length > 240
    || path.basename(name) !== name
    || !name.endsWith('.md')
  ) {
    throw new Error('Invalid report name.');
  }
  const file = resolveSafeExistingPath(root, path.join('reports', name));
  if (!file) throw new Error('Report not found.');
  const info = statSync(file);
  if (!info.isFile() || info.size > MAX_REPORT_BYTES) {
    throw new Error('Report cannot be displayed safely.');
  }
  return {
    name,
    content: readFileSync(file, 'utf8'),
    bytes: info.size,
    modifiedAt: info.mtime.toISOString(),
  };
}

function emptyDocument(relativePath: string): LocalDocument {
  return {
    relativePath,
    exists: false,
    content: '',
    bytes: 0,
    modifiedAt: null,
    revision: '',
  };
}

export function loadCareerOpsSnapshot(inputRoot: string): CareerOpsSnapshot {
  const validation = validateCareerOpsRoot(inputRoot);
  if (!validation.valid) {
    return {
      loadedAt: new Date().toISOString(),
      validation,
      cv: emptyDocument('cv.md'),
      profile: emptyDocument('config/profile.yml'),
      profileSummary: { ...EMPTY_PROFILE },
      profileWorkspace: structuredClone(EMPTY_PROFILE_WORKSPACE),
      pipeline: { total: 0, pending: 0, processed: 0, jobs: [] },
      tracker: { total: 0, byStatus: {}, applications: [] },
      reports: [],
    };
  }

  const root = validation.root;
  const cv = readLocalDocument(root, 'cv.md', MAX_DOCUMENT_BYTES);
  const profile = readLocalDocument(root, 'config/profile.yml', MAX_DOCUMENT_BYTES);
  const pipelineDocument = readLocalDocument(root, 'data/pipeline.md', MAX_PIPELINE_BYTES);
  const trackerDocument = readLocalDocument(root, 'data/applications.md', MAX_TRACKER_BYTES);

  return {
    loadedAt: new Date().toISOString(),
    validation,
    cv,
    profile,
    profileSummary: parseProfileSummary(profile.content),
    profileWorkspace: parseProfileWorkspace(profile.content),
    pipeline: parsePipeline(pipelineDocument.content),
    tracker: parseTracker(trackerDocument.content),
    reports: listReports(root),
  };
}
