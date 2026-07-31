import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import {
  isMap,
  isSeq,
  parseDocument,
  type Document,
  type YAMLMap,
} from 'yaml';
import type {
  PortalConfigSnapshot,
  PortalEntry,
  PortalFilters,
  PortalKind,
  SavePortalsRequest,
} from './contracts';
import { RevisionConflictError } from './profile-store';

const PORTALS_PATH = 'portals.yml';
const MAX_PORTALS_BYTES = 2_000_000;
const MAX_ENTRIES = 2_000;
const MAX_TEXT = 4_000;

function revision(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strings(value: unknown): string[] {
  const values = isSeq(value) ? value.toJSON() : value;
  return Array.isArray(values)
    ? values.map(text).filter(Boolean)
    : [];
}

function inferProvider(entry: Record<string, unknown>): string {
  const explicit = text(entry.provider);
  if (explicit) return explicit;
  if (text(entry.scan_method) === 'websearch') return 'websearch';
  const source = `${text(entry.api)} ${text(entry.careers_url)}`.toLowerCase();
  if (source.includes('greenhouse.io')) return 'greenhouse';
  if (source.includes('lever.co')) return 'lever';
  if (source.includes('ashbyhq.com')) return 'ashby';
  if (source.includes('myworkdayjobs.com')) return 'workday';
  if (source.includes('icims.com')) return 'icims';
  return 'unresolved';
}

function readEntries(document: Document, key: 'tracked_companies' | 'job_boards', kind: PortalKind): PortalEntry[] {
  const sequence = document.get(key, true);
  if (!isSeq(sequence)) return [];
  return sequence.items.flatMap((item, index) => {
    if (!isMap(item)) return [];
    const entry = item.toJSON() as Record<string, unknown>;
    return [{
      id: `${kind}:${index}`,
      kind,
      name: text(entry.name),
      provider: inferProvider(entry),
      careersUrl: text(entry.careers_url),
      api: text(entry.api),
      scanMethod: text(entry.scan_method),
      enabled: entry.enabled !== false,
      notes: text(entry.notes),
    }];
  });
}

function readFilters(document: Document): PortalFilters {
  return {
    titlePositive: strings(document.getIn(['title_filter', 'positive'])),
    titleNegative: strings(document.getIn(['title_filter', 'negative'])),
    locationAlwaysAllow: strings(document.getIn(['location_filter', 'always_allow'])),
    locationAllow: strings(document.getIn(['location_filter', 'allow'])),
    locationBlock: strings(document.getIn(['location_filter', 'block'])),
    maxPostingAgeDays: typeof document.get('max_posting_age_days') === 'number'
      ? Number(document.get('max_posting_age_days'))
      : null,
    trustEnabled: document.getIn(['trust_filter', 'enabled']) === true,
  };
}

function providerCounts(entries: PortalEntry[]): PortalConfigSnapshot['providerCounts'] {
  const counts = new Map<string, { total: number; enabled: number }>();
  for (const entry of entries) {
    const current = counts.get(entry.provider) ?? { total: 0, enabled: 0 };
    current.total += 1;
    if (entry.enabled) current.enabled += 1;
    counts.set(entry.provider, current);
  }
  return [...counts.entries()]
    .map(([provider, count]) => ({ provider, ...count }))
    .sort((a, b) => b.enabled - a.enabled || a.provider.localeCompare(b.provider));
}

async function safePortalsFile(root: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const file = await realpath(path.join(canonicalRoot, PORTALS_PATH));
  const relative = path.relative(canonicalRoot, file);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('portals.yml 不能指向 career-ops 工作区之外。');
  }
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_PORTALS_BYTES) throw new Error('portals.yml 无法安全读取。');
  return file;
}

function parse(content: string): Document {
  const document = parseDocument(content, { keepSourceTokens: true });
  if (document.errors.length) throw new Error(`portals.yml 解析失败：${document.errors[0].message}`);
  return document;
}

export async function loadPortalConfig(root: string): Promise<PortalConfigSnapshot> {
  const file = await safePortalsFile(root);
  const [content, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
  const document = parse(content);
  const entries = [
    ...readEntries(document, 'tracked_companies', 'company'),
    ...readEntries(document, 'job_boards', 'board'),
  ];
  return {
    revision: revision(content),
    modifiedAt: info.mtime.toISOString(),
    bytes: info.size,
    entries,
    filters: readFilters(document),
    providerCounts: providerCounts(entries),
  };
}

function boundedText(value: unknown, label: string, required = false): string {
  if (typeof value !== 'string' || value.includes('\u0000')) throw new Error(`${label} 格式无效。`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} 不能为空。`);
  if (normalized.length > MAX_TEXT) throw new Error(`${label} 内容过长。`);
  return normalized;
}

function cleanEntry(value: PortalEntry): PortalEntry {
  if (!value || typeof value !== 'object' || !['company', 'board'].includes(value.kind)) {
    throw new Error('Portal 条目格式无效。');
  }
  const entry: PortalEntry = {
    id: boundedText(value.id, 'Portal ID', true),
    kind: value.kind,
    name: boundedText(value.name, 'Portal 名称', true),
    provider: boundedText(value.provider, 'Provider', true).toLowerCase(),
    careersUrl: boundedText(value.careersUrl, '招聘页面'),
    api: boundedText(value.api, 'API 地址'),
    scanMethod: boundedText(value.scanMethod, '扫描方式'),
    enabled: value.enabled === true,
    notes: boundedText(value.notes, 'Portal 备注'),
  };
  if (!entry.careersUrl && !entry.api && entry.provider === 'unresolved') {
    throw new Error(`${entry.name} 缺少可识别的 Provider、招聘页面或 API。`);
  }
  for (const candidate of [entry.careersUrl, entry.api]) {
    if (!candidate) continue;
    let parsed: URL;
    try { parsed = new URL(candidate); } catch { throw new Error(`${entry.name} 的 URL 无效。`); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error(`${entry.name} 的 URL 必须是无凭据的 HTTP(S) 地址。`);
    }
  }
  return entry;
}

function cleanList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error(`${label} 格式无效。`);
  return [...new Set(value.map((item) => boundedText(item, label)).filter(Boolean))];
}

function cleanFilters(value: PortalFilters): PortalFilters {
  if (!value || typeof value !== 'object') throw new Error('过滤条件格式无效。');
  const age = value.maxPostingAgeDays;
  if (age !== null && (!Number.isInteger(age) || age < 1 || age > 3650)) {
    throw new Error('发布时间范围必须是 1–3650 天。');
  }
  return {
    titlePositive: cleanList(value.titlePositive, '标题包含词'),
    titleNegative: cleanList(value.titleNegative, '标题排除词'),
    locationAlwaysAllow: cleanList(value.locationAlwaysAllow, '地点优先允许词'),
    locationAllow: cleanList(value.locationAllow, '地点允许词'),
    locationBlock: cleanList(value.locationBlock, '地点排除词'),
    maxPostingAgeDays: age,
    trustEnabled: value.trustEnabled === true,
  };
}

function updateMap(map: YAMLMap, entry: PortalEntry): void {
  map.set('name', entry.name);
  map.set('enabled', entry.enabled);
  if (entry.careersUrl) map.set('careers_url', entry.careersUrl); else map.delete('careers_url');
  if (entry.api) map.set('api', entry.api); else map.delete('api');
  if (entry.scanMethod) map.set('scan_method', entry.scanMethod); else map.delete('scan_method');
  if (entry.notes) map.set('notes', entry.notes); else map.delete('notes');
  const inferred = inferProvider({ careers_url: entry.careersUrl, api: entry.api, scan_method: entry.scanMethod });
  if (entry.provider && entry.provider !== inferred && entry.provider !== 'unresolved') {
    map.set('provider', entry.provider);
  } else {
    map.delete('provider');
  }
}

function applyEntries(document: Document, key: 'tracked_companies' | 'job_boards', kind: PortalKind, entries: PortalEntry[]): void {
  let sequence = document.get(key, true);
  if (!isSeq(sequence)) {
    document.set(key, []);
    sequence = document.get(key, true);
  }
  if (!isSeq(sequence)) throw new Error(`${key} 无法编辑。`);
  const originals = new Map(sequence.items.map((item, index) => [`${kind}:${index}`, item]));
  sequence.items = entries.map((entry) => {
    const original = originals.get(entry.id);
    const node = isMap(original) ? original : document.createNode({});
    if (!isMap(node)) throw new Error('Portal YAML 节点无效。');
    updateMap(node, entry);
    return node;
  });
}

function setFilters(document: Document, filters: PortalFilters): void {
  document.setIn(['title_filter', 'positive'], filters.titlePositive);
  document.setIn(['title_filter', 'negative'], filters.titleNegative);
  if (filters.locationAlwaysAllow.length || filters.locationAllow.length || filters.locationBlock.length) {
    document.setIn(['location_filter', 'always_allow'], filters.locationAlwaysAllow);
    document.setIn(['location_filter', 'allow'], filters.locationAllow);
    document.setIn(['location_filter', 'block'], filters.locationBlock);
  } else {
    document.delete('location_filter');
  }
  if (filters.maxPostingAgeDays === null) document.delete('max_posting_age_days');
  else document.set('max_posting_age_days', filters.maxPostingAgeDays);
  document.setIn(['trust_filter', 'enabled'], filters.trustEnabled);
}

export async function savePortalConfig(root: string, request: SavePortalsRequest): Promise<string> {
  if (!request || typeof request !== 'object' || typeof request.expectedRevision !== 'string') {
    throw new Error('Portal 保存请求格式无效。');
  }
  if (!Array.isArray(request.entries) || request.entries.length > MAX_ENTRIES) {
    throw new Error('Portal 条目数量无效。');
  }
  const entries = request.entries.map(cleanEntry);
  const names = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.name.toLowerCase()}`;
    if (names.has(key)) throw new Error(`Portal 名称重复：${entry.name}`);
    names.add(key);
  }
  const filters = cleanFilters(request.filters);
  const file = await safePortalsFile(root);
  const current = await readFile(file, 'utf8');
  if (revision(current) !== request.expectedRevision) throw new RevisionConflictError(PORTALS_PATH);
  const document = parse(current);
  applyEntries(document, 'tracked_companies', 'company', entries.filter((entry) => entry.kind === 'company'));
  applyEntries(document, 'job_boards', 'board', entries.filter((entry) => entry.kind === 'board'));
  setFilters(document, filters);
  const next = document.toString({ lineWidth: 0 });
  if (Buffer.byteLength(next) > MAX_PORTALS_BYTES) throw new Error('portals.yml 保存内容过大。');

  const backupDirectory = path.join(root, 'data', 'backups', 'portals', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  await mkdir(backupDirectory, { recursive: true });
  await writeFileAtomic(path.join(backupDirectory, 'portals.yml'), current, { encoding: 'utf8', mode: 0o600 });
  await writeFileAtomic(path.join(backupDirectory, 'manifest.json'), `${JSON.stringify({
    createdAt: new Date().toISOString(),
    reason: 'portal-editor',
    files: [{ relativePath: PORTALS_PATH, revision: revision(current), bytes: Buffer.byteLength(current) }],
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await writeFileAtomic(file, next, { encoding: 'utf8', mode: 0o600 });
  return backupDirectory;
}
