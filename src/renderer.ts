import './index.css';
import type {
  AiSettings,
  AiServicePreset,
  CareerOpsSnapshot,
  CompetitivenessAdvice,
  CompetitivenessAnalysis,
  JobEvaluation,
  JobInputKind,
  MarketCount,
  PipelineJob,
  ProfileEditor,
  ReportSummary,
  SaveResult,
  TrackerApplication,
  VerificationItem,
  VerificationStatus,
  AtsJob,
  AtsWorkspace,
  PortalEntry,
  PortalFilters,
  PortalSaveResult,
  ScanRequest,
  ScanRunStatus,
  AutomationWorkspace,
  BatchJob,
  BatchOptions,
  BatchRunStatus,
  ApplicationMaterialsWorkspace,
  ApplicationMaterialVersion,
  ApplicationMaterialTone,
  MaterialComparison,
  FollowupCadenceResult,
  ReplyRecommendation,
  TrackerStatus,
} from './contracts';

type ViewName = 'overview' | 'cv' | 'profile' | 'analysis' | 'evaluation' | 'ats' | 'automation' | 'materials' | 'pipeline' | 'tracker' | 'reports';
type PipelineFilter = 'pending' | 'processed' | 'all';
type AdviceFilter = 'all' | 'CV' | 'LinkedIn' | 'GitHub' | 'Portfolio';

const VIEW_META: Record<ViewName, { eyebrow: string; title: string }> = {
  overview: { eyebrow: '工作区状态', title: '今天的求职资料' },
  cv: { eyebrow: '简历事实来源', title: 'CV 原始资料' },
  profile: { eyebrow: '候选人配置', title: '个人资料与求职方向' },
  analysis: { eyebrow: '阶段 3', title: '竞争力与市场分析' },
  evaluation: { eyebrow: '阶段 4', title: '单岗位完整评估' },
  ats: { eyebrow: '阶段 5', title: 'ATS 扫描与岗位中心' },
  automation: { eyebrow: '阶段 6', title: '批量评分与每日自动化' },
  materials: { eyebrow: '阶段 7', title: '申请材料与版本管理' },
  pipeline: { eyebrow: '岗位数据', title: 'career-ops 收件箱' },
  tracker: { eyebrow: '申请状态', title: '申请追踪' },
  reports: { eyebrow: '评估产物', title: '岗位评估报告' },
};

let snapshot: CareerOpsSnapshot | null = null;
let pipelineFilter: PipelineFilter = 'pending';
let pipelineQuery = '';
let activeReport = '';
let profileDirty = false;
let cvDirty = false;
let verificationDraft: VerificationItem[] = [];
let currentAnalysis: CompetitivenessAnalysis | null = null;
let adviceFilter: AdviceFilter = 'all';
let jobInputKind: JobInputKind = 'url';
let currentJobEvaluation: JobEvaluation | null = null;
let atsWorkspace: AtsWorkspace | null = null;
let portalDraft: PortalEntry[] = [];
let portalDirty = false;
let scanMode: ScanRequest['kind'] = 'quick';
let scanTimer: number | null = null;
let automationWorkspace: AutomationWorkspace | null = null;
let batchTimer: number | null = null;
let materialsWorkspace: ApplicationMaterialsWorkspace | null = null;
let activeMaterialVersion: ApplicationMaterialVersion | null = null;
let activeMaterialTab: 'artifacts' | 'cover' | 'email' | 'linkedin' = 'artifacts';
let currentAiSettings: AiSettings | null = null;
let currentReplyRecommendation: ReplyRecommendation | null = null;

const MODEL_PRESETS: Record<AiServicePreset, {
  name: string;
  provider: AiSettings['provider'];
  baseUrl: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutSeconds: number;
  supportsVision: boolean;
}> = {
  openai: { name: 'OpenAI', provider: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-sol', temperature: 0.1, maxOutputTokens: 12_000, timeoutSeconds: 180, supportsVision: true },
  deepseek: { name: 'DeepSeek', provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', temperature: 0.1, maxOutputTokens: 8_000, timeoutSeconds: 180, supportsVision: false },
  anthropic: { name: 'Anthropic', provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', temperature: 0.1, maxOutputTokens: 12_000, timeoutSeconds: 180, supportsVision: true },
  openrouter: { name: 'OpenRouter', provider: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-5.6-sol', temperature: 0.1, maxOutputTokens: 12_000, timeoutSeconds: 180, supportsVision: true },
  ollama: { name: 'Ollama', provider: 'openai-compatible', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', temperature: 0.1, maxOutputTokens: 8_000, timeoutSeconds: 180, supportsVision: false },
  'lm-studio': { name: 'LM Studio', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', model: 'local-model', temperature: 0.1, maxOutputTokens: 8_000, timeoutSeconds: 180, supportsVision: false },
  custom: { name: '自定义服务', provider: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-sol', temperature: 0.1, maxOutputTokens: 12_000, timeoutSeconds: 180, supportsVision: false },
};

const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  verified: '已验证',
  unverified: '未验证',
  needs_review: '待复核',
};

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing interface element: ${selector}`);
  return found;
}

function setText(selector: string, value: unknown, fallback = '—'): void {
  const normalized = String(value ?? '').trim();
  element(selector).textContent = normalized || fallback;
}

function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'local source';
  }
}

function cvSummary(markdown: string): string {
  const match = markdown.match(/^## Summary\s*\n+([\s\S]*?)(?=\n##\s|$)/im);
  return match?.[1]?.replace(/\s+/g, ' ').trim()
    || 'cv.md 中尚未找到 Summary 段落。';
}

function showNotice(message: string, tone: 'info' | 'error' = 'info'): void {
  const notice = element('#notice');
  notice.textContent = message;
  notice.className = `notice ${tone}`;
}

function hideNotice(): void {
  element('#notice').className = 'notice hidden';
}

function setInputValue(selector: string, value: string | number): void {
  element<HTMLInputElement | HTMLTextAreaElement>(selector).value = String(value ?? '');
}

function lines(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function setCheckedValues(name: string, values: string[]): void {
  const selected = new Set(values);
  document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function checkedValues(name: string): string[] {
  return [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)]
    .map((input) => input.value);
}

function setProfileDirty(dirty: boolean): void {
  profileDirty = dirty;
  const state = element('#profile-save-state');
  state.textContent = dirty ? '有未保存修改' : '未修改';
  state.className = `save-state${dirty ? ' dirty' : ''}`;
  element<HTMLButtonElement>('#save-profile-button').disabled = !dirty;
}

function setCvDirty(dirty: boolean): void {
  cvDirty = dirty;
  const state = element('#cv-save-state');
  state.textContent = dirty ? '有未保存修改' : '未修改';
  state.className = `save-state${dirty ? ' dirty' : ''}`;
  element<HTMLButtonElement>('#save-cv-button').disabled = !dirty;
}

function setPortalDirty(dirty: boolean): void {
  portalDirty = dirty;
  const state = element('#portal-save-state');
  state.textContent = dirty ? '有未保存修改' : '未修改';
  state.className = `save-state${dirty ? ' dirty' : ''}`;
  element<HTMLButtonElement>('#save-portals-button').disabled = !dirty;
}

function switchView(view: ViewName): void {
  document.querySelectorAll<HTMLElement>('.view').forEach((node) => {
    node.classList.toggle('active', node.id === `${view}-view`);
  });
  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  setText('#view-eyebrow', VIEW_META[view].eyebrow);
  setText('#view-title', VIEW_META[view].title);
}

function renderValidation(data: CareerOpsSnapshot): void {
  const { validation } = data;
  setText('#sidebar-root', validation.root);
  const ribbon = element('#validation-ribbon');
  ribbon.classList.toggle('invalid', !validation.valid);
  setText('#validation-title', validation.valid ? '已连接真实 career-ops 工作区' : '所选文件夹不是有效工作区');
  setText(
    '#validation-copy',
    validation.valid
      ? `真实数据已加载 · ${formatDate(data.loadedAt)} · 写入仅限用户层`
      : '请选择包含核心 career-ops 文件的文件夹',
  );
  setText('.ledger-icon', validation.valid ? '✓' : '!');
  const checks = element('#validation-checks');
  clear(checks);
  validation.checks.forEach((check) => {
    const chip = make('span', check.present ? 'check-chip ok' : check.required ? 'check-chip missing' : 'check-chip optional');
    chip.append(make('i', '', check.present ? '✓' : check.required ? '×' : '–'));
    chip.append(document.createTextNode(check.label));
    chip.title = check.relativePath;
    checks.append(chip);
  });
  if (!validation.valid) {
    showNotice(validation.warnings[0] || '无法读取所选工作区。', 'error');
  } else if (validation.warnings.length) {
    showNotice(validation.warnings.join(' '));
  } else {
    hideNotice();
  }
}

function renderVerificationCounts(): void {
  const counts: Record<VerificationStatus, number> = {
    verified: 0,
    unverified: 0,
    needs_review: 0,
  };
  verificationDraft.forEach((item) => {
    counts[item.status] += 1;
  });
  const container = element('#verification-counts');
  clear(container);
  (Object.keys(counts) as VerificationStatus[]).forEach((status) => {
    container.append(make(
      'span',
      `verification-count ${status}`,
      `${VERIFICATION_LABELS[status]} ${counts[status]}`,
    ));
  });
}

function verificationRow(item: VerificationItem): HTMLElement {
  const row = make('article', 'verification-row');
  row.dataset.factId = item.id;
  row.dataset.status = item.status;

  const identity = make('div', 'verification-identity');
  identity.append(
    make('strong', '', item.label),
    make('span', '', item.category),
    make('code', '', item.source || '未记录来源'),
  );

  const status = make('select') as HTMLSelectElement;
  status.dataset.verificationField = 'status';
  (Object.keys(VERIFICATION_LABELS) as VerificationStatus[]).forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = VERIFICATION_LABELS[value];
    option.selected = value === item.status;
    status.append(option);
  });
  status.setAttribute('aria-label', `${item.label} 验证状态`);

  const copy = make('div', 'verification-copy');
  const evidence = make('input') as HTMLInputElement;
  evidence.dataset.verificationField = 'evidence';
  evidence.value = item.evidence;
  evidence.placeholder = '验证证据';
  evidence.maxLength = 1000;
  evidence.setAttribute('aria-label', `${item.label} 验证证据`);
  const note = make('input') as HTMLInputElement;
  note.dataset.verificationField = 'note';
  note.value = item.note;
  note.placeholder = '备注';
  note.maxLength = 1000;
  note.setAttribute('aria-label', `${item.label} 备注`);
  copy.append(evidence, note);
  row.append(identity, status, copy);
  return row;
}

function renderVerification(): void {
  const list = element('#verification-list');
  clear(list);
  verificationDraft.forEach((item) => list.append(verificationRow(item)));
  renderVerificationCounts();
}

function renderProfile(data: CareerOpsSnapshot): void {
  const profile = data.profileSummary;
  const editor = data.profileWorkspace.editor;
  setText('#profile-name', profile.fullName);
  setText('#profile-headline', profile.headline);
  setText('#profile-location', profile.location);
  setText('#profile-language', profile.outputLanguage);
  setText('#profile-tier', profile.spendTier);
  setText(
    '#profile-meta',
    data.profile.exists
      ? `${formatBytes(data.profile.bytes)} · 更新于 ${formatDate(data.profile.modifiedAt)}`
      : '文件不存在',
  );

  const roles = element('#overview-target-roles');
  clear(roles);
  profile.targetRoles.forEach((role) => roles.append(make('span', 'role-chip', role)));
  if (!profile.targetRoles.length) roles.append(make('span', 'muted-copy', '未配置目标岗位'));

  setInputValue('#field-full-name', editor.fullName);
  setInputValue('#field-headline', editor.headline);
  setInputValue('#field-location', editor.location);
  setInputValue('#field-email', editor.email);
  setInputValue('#field-phone', editor.phone);
  setInputValue('#field-target-roles', editor.targetRoles.join('\n'));
  setInputValue('#field-country', editor.country);
  setInputValue('#field-city', editor.city);
  setInputValue('#field-timezone', editor.timezone);
  setInputValue('#field-max-age', editor.maxPostingAgeDays);
  setInputValue('#field-minimum', editor.compensationMinimum);
  setInputValue('#field-target-range', editor.compensationTargetRange);
  setInputValue('#field-currency', editor.compensationCurrency);
  setInputValue('#field-location-flexibility', editor.locationFlexibility);
  setInputValue('#field-preferred-regions', editor.preferredRegions.join('\n'));
  setInputValue('#field-other-requirements', editor.otherRequirements.join('\n'));
  setCheckedValues('work-arrangement', editor.workArrangements);
  setCheckedValues('employment-type', editor.employmentTypes);

  const migration = data.profileWorkspace.migration;
  setText('#migration-state', migration.state === 'completed' ? '已验证资料已迁入' : '迁移状态未确认');
  setText(
    '#migration-detail',
    migration.migratedAt
      ? `${migration.sourceLabel} · ${migration.migratedAt}`
      : 'profile.yml 中没有迁移记录',
  );
  const boundary = element('#migration-boundary');
  boundary.textContent = migration.runtimeDisconnected
    ? '运行时已断开旧 JSON'
    : '旧事实源边界待确认';
  boundary.classList.toggle('warning', !migration.runtimeDisconnected);

  verificationDraft = data.profileWorkspace.verification.map((item) => ({ ...item }));
  renderVerification();
  setProfileDirty(false);
}

function renderCv(data: CareerOpsSnapshot): void {
  setText('#cv-summary', cvSummary(data.cv.content));
  element<HTMLTextAreaElement>('#cv-document').value = data.cv.content;
  setText(
    '#cv-meta',
    data.cv.exists
      ? `${formatBytes(data.cv.bytes)} · 更新于 ${formatDate(data.cv.modifiedAt)}`
      : '文件不存在',
  );
  const outline = element('#cv-outline');
  clear(outline);
  const headings = [...data.cv.content.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());
  headings.forEach((heading) => outline.append(make('span', '', heading)));
  if (!headings.length) outline.append(make('span', 'muted-copy', '没有二级章节'));
  setCvDirty(false);
}

function makeJobRow(job: PipelineJob, compact = false): HTMLElement {
  const row = make('article', compact ? 'compact-job-row' : 'job-row');
  const marker = make('span', 'job-marker', job.company.slice(0, 2).toUpperCase());
  const copy = make('div', 'job-copy');
  copy.append(make('strong', '', job.role), make('span', '', job.company));
  const meta = make('div', 'job-meta');
  if (job.location) meta.append(make('span', '', job.location));
  if (job.postedAt) meta.append(make('span', '', `发布 ${job.postedAt}`));
  meta.append(make('span', '', sourceHost(job.url)));
  const state = make('span', job.done ? 'job-state done' : 'job-state pending', job.done ? '已处理' : '待处理');
  row.append(marker, copy, meta, state);
  return row;
}

function filteredJobs(): PipelineJob[] {
  if (!snapshot) return [];
  const query = pipelineQuery.trim().toLocaleLowerCase();
  return snapshot.pipeline.jobs.filter((job) => {
    const stateMatches = pipelineFilter === 'all'
      || (pipelineFilter === 'processed' ? job.done : !job.done);
    const haystack = `${job.company} ${job.role} ${job.location}`.toLocaleLowerCase();
    return stateMatches && (!query || haystack.includes(query));
  });
}

function renderPipeline(data: CareerOpsSnapshot): void {
  setText('#nav-pipeline-count', data.pipeline.pending);
  setText('#pending-count', data.pipeline.pending);
  setText('#processed-count', data.pipeline.processed);
  setText('#pipeline-total-count', data.pipeline.total);
  const list = element('#pipeline-jobs');
  clear(list);
  const jobs = filteredJobs();
  jobs.forEach((job) => list.append(makeJobRow(job)));
  if (!jobs.length) {
    const empty = make('div', 'empty-state inline');
    empty.append(make('span', '', '◇'), make('h3', '', '没有符合条件的岗位'), make('p', '', '更换筛选条件或选择另一个 career-ops 工作区。'));
    list.append(empty);
  }

  const overview = element('#overview-jobs');
  clear(overview);
  data.pipeline.jobs.filter((job) => !job.done).slice(0, 6).forEach((job) => {
    overview.append(makeJobRow(job, true));
  });
  if (!overview.children.length) {
    overview.append(make('p', 'empty-copy', '当前没有待处理岗位。'));
  }
}

function portalProvider(entry: PortalEntry): string {
  return entry.provider || 'unresolved';
}

function portalRow(entry: PortalEntry): HTMLElement {
  const row = make('article', 'portal-row');
  row.dataset.portalId = entry.id;
  const enabled = make('label', 'portal-enabled');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = entry.enabled;
  toggle.dataset.portalField = 'enabled';
  enabled.append(toggle, make('span', '', entry.enabled ? '启用' : '停用'));

  const identity = make('div', 'portal-identity');
  const name = document.createElement('input');
  name.value = entry.name;
  name.dataset.portalField = 'name';
  name.placeholder = '公司或 Job board 名称';
  name.maxLength = 200;
  const kind = document.createElement('select');
  kind.dataset.portalField = 'kind';
  kind.innerHTML = '<option value="company">公司</option><option value="board">Job board</option>';
  kind.value = entry.kind;
  identity.append(name, kind);

  const provider = document.createElement('select');
  provider.dataset.portalField = 'provider';
  const providers = ['greenhouse', 'lever', 'ashby', 'workday', 'icims', 'gem', 'workable', 'smartrecruiters', 'personio', 'local-parser', 'websearch', 'unresolved'];
  if (!providers.includes(entry.provider)) providers.unshift(entry.provider);
  provider.append(...providers.map((value) => {
    const option = document.createElement('option'); option.value = value; option.textContent = value; return option;
  }));
  provider.value = entry.provider;

  const source = make('div', 'portal-source');
  const url = document.createElement('input');
  url.value = entry.careersUrl;
  url.dataset.portalField = 'careersUrl';
  url.placeholder = 'https://company.com/careers';
  const api = document.createElement('input');
  api.value = entry.api;
  api.dataset.portalField = 'api';
  api.placeholder = '公开 ATS API（可选）';
  source.append(url, api);

  const actions = make('div', 'portal-row-actions');
  actions.append(make('span', `provider-badge provider-${portalProvider(entry)}`, portalProvider(entry)));
  const remove = make('button', 'icon-button', '×');
  remove.type = 'button';
  remove.dataset.removePortal = entry.id;
  remove.title = '删除 Portal';
  remove.setAttribute('aria-label', `删除 ${entry.name || 'Portal'}`);
  actions.append(remove);
  row.append(enabled, identity, provider, source, actions);
  return row;
}

function renderPortalEditor(): void {
  if (!atsWorkspace) return;
  const list = element('#portal-list');
  clear(list);
  portalDraft.forEach((entry) => list.append(portalRow(entry)));
  setText('#portal-count-label', `${portalDraft.filter((entry) => entry.enabled).length} / ${portalDraft.length} 已启用`);
  const strip = element('#provider-strip');
  clear(strip);
  const counts = new Map<string, { total: number; enabled: number }>();
  portalDraft.forEach((entry) => {
    const value = counts.get(entry.provider) ?? { total: 0, enabled: 0 };
    value.total += 1; if (entry.enabled) value.enabled += 1; counts.set(entry.provider, value);
  });
  [...counts.entries()].sort((a, b) => b[1].enabled - a[1].enabled).forEach(([provider, count]) => {
    const chip = make('span', 'provider-summary');
    chip.append(make('strong', '', String(count.enabled)), document.createTextNode(`${provider} / ${count.total}`));
    strip.append(chip);
  });
  const select = element<HTMLSelectElement>('#quick-scan-company');
  const selected = select.value;
  select.replaceChildren(new Option('全部已启用 Portal', ''));
  portalDraft.filter((entry) => entry.kind === 'company' && entry.enabled).forEach((entry) => {
    select.append(new Option(entry.name, entry.name));
  });
  select.value = selected;
}

function fillPortalFilters(filters: PortalFilters): void {
  setInputValue('#portal-title-positive', filters.titlePositive.join('\n'));
  setInputValue('#portal-title-negative', filters.titleNegative.join('\n'));
  setInputValue('#portal-location-always', filters.locationAlwaysAllow.join('\n'));
  setInputValue('#portal-location-allow', filters.locationAllow.join('\n'));
  setInputValue('#portal-location-block', filters.locationBlock.join('\n'));
  setInputValue('#portal-max-age', filters.maxPostingAgeDays ?? '');
  element<HTMLInputElement>('#portal-trust-enabled').checked = filters.trustEnabled;
}

function readPortalFilters(): PortalFilters {
  const age = inputValue('#portal-max-age');
  return {
    titlePositive: lines(inputValue('#portal-title-positive')),
    titleNegative: lines(inputValue('#portal-title-negative')),
    locationAlwaysAllow: lines(inputValue('#portal-location-always')),
    locationAllow: lines(inputValue('#portal-location-allow')),
    locationBlock: lines(inputValue('#portal-location-block')),
    maxPostingAgeDays: age ? Number(age) : null,
    trustEnabled: element<HTMLInputElement>('#portal-trust-enabled').checked,
  };
}

function freshnessLabel(job: AtsJob): string {
  if (job.freshness === 'today') return '今天';
  if (job.freshness === 'fresh') return `${job.ageDays} 天前`;
  if (job.freshness === 'aging') return `${job.ageDays} 天前`;
  if (job.freshness === 'old') return `${job.ageDays} 天前`;
  return '未提供';
}

function healthLabel(job: AtsJob): string {
  const labels: Record<AtsJob['health'], string> = {
    reachable: '可访问', empty: '可访问·空', slug_gone: 'Slug 失效', network: '网络错误',
    auth: '鉴权阻止', server: '服务错误', unknown: '未知错误', not_checked: '未检测',
  };
  return labels[job.health];
}

function renderAtsJobs(): void {
  if (!atsWorkspace) return;
  const query = inputValue('#ats-job-search').toLowerCase();
  const state = element<HTMLSelectElement>('#ats-job-state').value;
  const jobs = atsWorkspace.jobs.filter((job) => {
    const matchesQuery = !query || `${job.company} ${job.role} ${job.location} ${job.provider}`.toLowerCase().includes(query);
    const matchesState = state === 'all'
      || (state === 'fresh' && ['today', 'fresh'].includes(job.freshness))
      || (state === 'pipeline' && job.inPipeline && !job.processed)
      || (state === 'risk' && (job.duplicateState !== 'unique' || (job.trustScore !== null && job.trustScore < 100)))
      || (state === 'expired' && job.liveness === 'expired');
    return matchesQuery && matchesState;
  });
  setText('#ats-visible-count', `${jobs.length} 个岗位`);
  const body = element('#ats-job-body');
  clear(body);
  jobs.slice(0, 1000).forEach((job) => {
    const row = document.createElement('tr');
    const identity = make('td', 'ats-job-identity');
    identity.append(make('strong', '', job.role), make('span', '', `${job.company}${job.location ? ` · ${job.location}` : ''}`), make('small', '', job.url));
    row.append(identity);
    const provider = make('td'); provider.append(make('span', `provider-badge provider-${job.provider}`, job.provider)); row.append(provider);
    const posted = make('td'); posted.append(make('strong', `freshness ${job.freshness}`, freshnessLabel(job)), make('small', '', job.postedAt || `首次发现 ${job.firstSeen}`)); row.append(posted);
    const trust = make('td');
    trust.append(make('span', `health-pill ${job.trustScore !== null && job.trustScore < 100 ? 'warning' : 'ok'}`, job.trustScore === null ? '未标注' : `${job.trustScore}/100`));
    if (job.trustFlags.length) trust.append(make('small', '', job.trustFlags.join(', ')));
    row.append(trust);
    const duplicate = make('td');
    duplicate.append(make('span', `duplicate-pill ${job.duplicateState}`, job.duplicateState === 'unique' ? '唯一' : job.duplicateState === 'repost' ? `重发 ×${job.repostCount}` : '跨站重复'));
    row.append(duplicate);
    const health = make('td');
    health.append(make('span', `health-pill ${['reachable', 'empty'].includes(job.health) ? 'ok' : job.health === 'not_checked' ? '' : 'warning'}`, healthLabel(job)));
    if (job.liveness !== 'not_checked') {
      const livenessLabels: Record<AtsJob['liveness'], string> = {
        active: '岗位有效', expired: '岗位已失效', blocked: '岗位访问受阻', invalid: '岗位地址无效', not_checked: '未检测',
      };
      health.append(make('small', '', livenessLabels[job.liveness]));
    }
    row.append(health);
    body.append(row);
  });
  element('#ats-job-empty').classList.toggle('hidden', jobs.length > 0);
}

function renderAtsRuns(): void {
  if (!atsWorkspace) return;
  const body = element('#ats-runs-body'); clear(body);
  atsWorkspace.runs.slice(0, 100).forEach((run) => {
    const row = document.createElement('tr');
    row.append(make('td', '', formatDate(run.timestamp)), make('td', '', `${run.companies} 公司 · ${run.boards} Board`), make('td', '', String(run.found)), make('td', '', String(run.filtered)), make('td', '', String(run.duplicates)), make('td', '', String(run.added)), make('td', run.errors ? 'danger-text' : '', String(run.errors)));
    body.append(row);
  });
  element('#ats-runs-empty').classList.toggle('hidden', atsWorkspace.runs.length > 0);
}

function renderAtsWorkspace(data: AtsWorkspace): void {
  atsWorkspace = data;
  portalDraft = data.portals.entries.map((entry) => ({ ...entry }));
  setText('#nav-ats-count', data.totals.activePipeline);
  setText('#ats-total-jobs', data.totals.jobs);
  setText('#ats-pipeline-jobs', data.totals.activePipeline);
  setText('#ats-fresh-jobs', data.totals.fresh);
  setText('#ats-risk-jobs', data.totals.trustFlagged + data.totals.reposts);
  setText('#ats-health-count', data.totals.unhealthyPortals);
  setText('#portal-meta', `${formatBytes(data.portals.bytes)} · ${formatDate(data.portals.modifiedAt)}`);
  fillPortalFilters(data.portals.filters);
  renderPortalEditor();
  renderAtsJobs();
  renderAtsRuns();
  setPortalDirty(false);
}

async function loadAtsWorkspaceView(showErrors = true): Promise<void> {
  try {
    renderAtsWorkspace(await window.careerOps.getAtsWorkspace());
  } catch (error) {
    if (showErrors) showNotice(error instanceof Error ? error.message : '无法读取 ATS 岗位中心。', 'error');
  }
}

function renderScanStatus(run: ScanRunStatus): void {
  const labels: Record<ScanRunStatus['state'], string> = { idle: '未运行', running: '扫描中', completed: '已完成', failed: '失败', cancelled: '已停止' };
  setText('#scan-state-label', run.commandLabel ? `${labels[run.state]} · ${run.commandLabel}` : labels[run.state]);
  setText('#scan-state-time', run.startedAt ? `${formatDate(run.startedAt)}${run.endedAt ? ` → ${formatDate(run.endedAt)}` : ''}` : '—');
  element('#scan-state-dot').className = `status-dot scan-${run.state}`;
  element('#scan-log').textContent = run.logs.length ? run.logs.join('\n') : run.error || '等待扫描任务。';
  const running = run.state === 'running';
  element<HTMLButtonElement>('#start-scan-button').disabled = running;
  element('#cancel-scan-button').classList.toggle('hidden', !running);
}

async function pollScanStatus(): Promise<void> {
  const run = await window.careerOps.getScanStatus();
  renderScanStatus(run);
  if (run.state === 'running') return;
  if (scanTimer !== null) window.clearInterval(scanTimer);
  scanTimer = null;
  if (['completed', 'cancelled'].includes(run.state)) {
    await loadAtsWorkspaceView(false);
    const next = await window.careerOps.getSnapshot();
    renderSnapshot(next);
    await loadAtsWorkspaceView(false);
  }
}

function readNumber(selector: string): number {
  return Number(element<HTMLInputElement>(selector).value);
}

function readBatchOptions(overrides: Partial<BatchOptions> = {}): BatchOptions {
  return {
    concurrency: readNumber('#batch-concurrency'),
    maxRetries: readNumber('#batch-max-retries'),
    retryDelaySeconds: readNumber('#batch-retry-delay'),
    limit: readNumber('#batch-limit'),
    notifyScore: readNumber('#batch-notify-score'),
    retryFailed: false,
    resumeIncomplete: false,
    ...overrides,
  };
}

function setBatchOptionValues(options: BatchOptions): void {
  setInputValue('#batch-concurrency', options.concurrency);
  setInputValue('#batch-max-retries', options.maxRetries);
  setInputValue('#batch-retry-delay', options.retryDelaySeconds);
  setInputValue('#batch-limit', options.limit);
  setInputValue('#batch-notify-score', options.notifyScore);
}

function batchStatusLabel(status: BatchJob['status']): string {
  return ({
    pending: '等待', processing: '评分中', completed: '已完成', failed: '失败', skipped: '已跳过',
    rate_limited: '限流', paused_rate_limit: '限流暂停',
  } as Record<BatchJob['status'], string>)[status];
}

function renderBatchJobs(jobs: BatchJob[]): void {
  const body = element('#batch-jobs-body');
  clear(body);
  jobs.forEach((job) => {
    const row = document.createElement('tr');
    row.append(make('td', 'mono-cell', String(job.id)));
    const identity = make('td', 'batch-job-identity');
    identity.append(make('strong', '', job.company || sourceHost(job.url)), make('span', '', job.role || job.url));
    row.append(identity);
    const status = make('td');
    status.append(make('span', `batch-status-pill status-${job.status}`, batchStatusLabel(job.status)));
    row.append(status);
    row.append(make('td', job.score !== null && job.score >= 4 ? 'good-text' : '', job.score === null ? '—' : job.score.toFixed(1)));
    row.append(make('td', '', String(job.retries)));
    const detail = make('td', job.error ? 'batch-job-detail error' : 'batch-job-detail');
    detail.textContent = job.error || (job.reportNumber ? `报告 #${job.reportNumber}` : '—');
    detail.title = detail.textContent;
    row.append(detail);
    body.append(row);
  });
  element('#batch-jobs-empty').classList.toggle('hidden', jobs.length > 0);
  setText('#batch-jobs-count', `${jobs.length} 个任务`);
}

function renderBatchStatus(run: BatchRunStatus, fallbackLogs: string[] = []): void {
  const labels: Record<BatchRunStatus['state'], string> = {
    idle: '未运行', running: '运行中', cancelling: '正在停止', completed: '已完成', failed: '失败', cancelled: '已停止',
  };
  setText('#batch-state-label', labels[run.state]);
  element('#batch-state-dot').className = `status-dot batch-${run.state}`;
  setText('#batch-queued-count', run.queued);
  setText('#batch-active-count', run.active);
  setText('#batch-completed-count', run.completed);
  setText('#batch-failed-count', run.failed);
  setText('#batch-concurrency-label', `并发 ${run.options?.concurrency ?? readNumber('#batch-concurrency')}`);
  setText('#batch-run-time', run.startedAt ? `${formatDate(run.startedAt)}${run.endedAt ? ` → ${formatDate(run.endedAt)}` : ''}` : '尚未开始');
  setText('#batch-high-match-count', `${run.highMatches.length} 个高分岗位`);
  const logs = run.logs.length ? run.logs : fallbackLogs;
  element('#batch-log').textContent = logs.length ? logs.join('\n') : run.error || '等待批量任务。';
  const active = ['running', 'cancelling'].includes(run.state);
  element<HTMLButtonElement>('#start-batch-button').disabled = active;
  element<HTMLButtonElement>('#retry-failed-button').disabled = active;
  element<HTMLButtonElement>('#resume-batch-button').disabled = active;
  element('#cancel-batch-button').classList.toggle('hidden', !active);
}

function renderSchedule(data: AutomationWorkspace['schedule']): void {
  element<HTMLInputElement>('#schedule-enabled').checked = data.enabled;
  setInputValue('#schedule-hour', data.hour);
  setInputValue('#schedule-minute', data.minute);
  setText('#schedule-state', data.installed && data.enabled ? '已安装并启用' : data.enabled ? '配置异常' : '已停用');
  element('#schedule-state').className = `schedule-state${data.installed && data.enabled ? ' installed' : ''}`;
  setText('#schedule-next-run', data.nextRunAt ? formatDate(data.nextRunAt) : '—');
  setText('#schedule-label', data.label);
  setText('#schedule-log-path', data.stdoutPath);
  setBatchOptionValues(data.options);
}

function renderAutomationWorkspace(data: AutomationWorkspace): void {
  automationWorkspace = data;
  setText('#nav-batch-count', data.pendingPipeline);
  setText('#batch-pending-count', data.pendingPipeline);
  renderBatchJobs(data.jobs);
  renderBatchStatus(data.run, data.recentLog);
  renderSchedule(data.schedule);
}

async function loadAutomationWorkspace(showErrors = true): Promise<void> {
  try {
    renderAutomationWorkspace(await window.careerOps.getAutomationWorkspace());
  } catch (error) {
    if (showErrors) showNotice(error instanceof Error ? error.message : '无法读取批量自动化状态。', 'error');
  }
}

async function pollBatchStatus(): Promise<void> {
  const run = await window.careerOps.getBatchStatus();
  renderBatchStatus(run, automationWorkspace?.recentLog ?? []);
  if (['running', 'cancelling'].includes(run.state)) return;
  if (batchTimer !== null) window.clearInterval(batchTimer);
  batchTimer = null;
  await loadAutomationWorkspace(false);
  if (['completed', 'cancelled'].includes(run.state)) {
    renderSnapshot(await window.careerOps.getSnapshot());
  }
}

async function runBatch(overrides: Partial<BatchOptions> = {}): Promise<void> {
  try {
    const run = await window.careerOps.startBatch(readBatchOptions(overrides));
    renderBatchStatus(run);
    if (batchTimer !== null) window.clearInterval(batchTimer);
    if (run.state === 'running') batchTimer = window.setInterval(() => { void pollBatchStatus(); }, 700);
    else await loadAutomationWorkspace(false);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '批量评分无法启动。', 'error');
  }
}

async function saveDailySchedule(): Promise<void> {
  if (!automationWorkspace) return;
  const button = element<HTMLButtonElement>('#save-schedule-button');
  button.disabled = true;
  try {
    const schedule = await window.careerOps.saveDailyAutomation({
      expectedRevision: automationWorkspace.schedule.revision,
      enabled: element<HTMLInputElement>('#schedule-enabled').checked,
      hour: readNumber('#schedule-hour'),
      minute: readNumber('#schedule-minute'),
      options: readBatchOptions({ resumeIncomplete: true }),
    });
    automationWorkspace = { ...automationWorkspace, schedule };
    renderSchedule(schedule);
    showNotice(schedule.enabled ? '每日 LaunchAgent 已安装并加载。' : '每日 LaunchAgent 已停用。');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '每日自动化保存失败。', 'error');
  } finally {
    button.disabled = false;
  }
}

function materialReport(): ReportSummary | null {
  const name = element<HTMLSelectElement>('#material-report').value;
  return materialsWorkspace?.reports.find((report) => report.name === name) ?? null;
}

function updateMaterialReportSummary(): void {
  const report = materialReport();
  const summary = element('#material-report-summary');
  const gate = element('#material-low-score-gate');
  const numericScore = Number.parseFloat(report?.score ?? '');
  clear(summary);
  if (!report) {
    summary.append(make('strong', '', '尚未选择岗位'), make('span', '', '先完成阶段 4 评估，再生成申请材料。'));
    gate.classList.add('hidden');
    return;
  }
  summary.append(
    make('strong', '', `${report.company || '未知公司'} · ${report.role || report.title}`),
    make('span', '', `${report.score || '未评分'} · ${report.name}`),
  );
  const lowScore = Number.isFinite(numericScore) && numericScore < 4;
  gate.classList.toggle('hidden', !lowScore);
  if (!lowScore) element<HTMLInputElement>('#material-low-score-override').checked = false;
}

function materialVersionKey(version: ApplicationMaterialVersion): string {
  return `${version.packageId}:${version.version}`;
}

function setSelectOptions(select: HTMLSelectElement, options: Array<{ value: string; label: string }>, selected = ''): void {
  clear(select);
  options.forEach((option) => {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    select.append(node);
  });
  if (selected && options.some((option) => option.value === selected)) select.value = selected;
}

function renderMaterialPreview(): void {
  const version = activeMaterialVersion;
  const preview = element('#material-preview');
  clear(preview);
  document.querySelectorAll<HTMLButtonElement>('[data-material-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.materialTab === activeMaterialTab);
  });
  if (!version) return;
  if (activeMaterialTab === 'artifacts') {
    const grid = make('div', 'material-artifact-grid');
    version.artifacts.filter((item) => item.kind !== 'manifest').forEach((item) => {
      const row = make('article', `material-artifact${item.available ? '' : ' unavailable'}`);
      const copy = make('div');
      copy.append(make('strong', '', item.label), make('span', '', item.available ? `${item.relativePath} · ${formatBytes(item.bytes)}` : '本机工具不可用，未生成'));
      const button = make('button', 'secondary-button', '打开') as HTMLButtonElement;
      button.type = 'button';
      button.disabled = !item.available;
      button.dataset.openMaterial = item.relativePath;
      row.append(copy, button);
      grid.append(row);
    });
    preview.append(grid);
    return;
  }
  const documentNode = make('pre', 'material-document');
  if (activeMaterialTab === 'cover') documentNode.textContent = version.preview.coverLetter;
  if (activeMaterialTab === 'email') documentNode.textContent = `Subject: ${version.preview.emailSubject}\n\n${version.preview.emailBody}`;
  if (activeMaterialTab === 'linkedin') {
    documentNode.textContent = `HEADLINE\n${version.preview.linkedinHeadline}\n\nABOUT\n${version.preview.linkedinAbout}\n\nOUTREACH DRAFT\n${version.preview.linkedinOutreach}`;
  }
  preview.append(documentNode);
}

function renderActiveMaterialVersion(): void {
  const version = activeMaterialVersion;
  element('#material-empty').classList.toggle('hidden', Boolean(version));
  element('#material-active-version').classList.toggle('hidden', !version);
  if (!version) return;
  setText('#material-version-label', `${version.versionLabel} · 报告 #${version.reportNumber}`);
  setText('#material-version-title', `${version.company} · ${version.role}`);
  setText('#material-version-meta', `${formatDate(version.createdAt)}${version.note ? ` · ${version.note}` : ''}`);
  setText('#material-version-model', version.model);
  setText('#material-version-cost', version.costUsd === null ? '成本未配置' : `$${version.costUsd.toFixed(6)}`);
  const warnings = element('#material-warnings');
  clear(warnings);
  version.warnings.forEach((warning) => warnings.append(make('p', '', warning)));
  warnings.classList.toggle('hidden', version.warnings.length === 0);
  renderMaterialPreview();
}

function renderMaterialHistory(): void {
  const versions = materialsWorkspace?.versions ?? [];
  setText('#nav-materials-count', versions.length);
  setText('#material-history-count', `${versions.length} 个版本`);
  const list = element('#material-history-list');
  clear(list);
  versions.forEach((version) => {
    const button = make('button', 'material-history-item') as HTMLButtonElement;
    button.type = 'button';
    button.dataset.materialVersion = materialVersionKey(version);
    button.classList.toggle('active', activeMaterialVersion ? materialVersionKey(activeMaterialVersion) === materialVersionKey(version) : false);
    const copy = make('span');
    copy.append(make('strong', '', `${version.company} · ${version.role}`), make('small', '', `${version.versionLabel} · ${formatDate(version.createdAt)}`));
    const meta = make('span', 'material-history-meta');
    meta.append(make('b', '', version.score === null ? '—' : `${version.score.toFixed(1)}/5`), make('small', '', version.model));
    button.append(copy, meta);
    list.append(button);
  });
  if (!versions.length) list.append(make('p', 'empty-copy', '还没有成功生成的版本。'));
}

function updateComparisonVersionOptions(): void {
  const packageId = element<HTMLSelectElement>('#comparison-package').value;
  const versions = (materialsWorkspace?.versions ?? [])
    .filter((version) => version.packageId === packageId)
    .sort((a, b) => a.version - b.version);
  const options = versions.map((version) => ({ value: String(version.version), label: `${version.versionLabel} · ${formatDate(version.createdAt)}` }));
  setSelectOptions(element<HTMLSelectElement>('#comparison-from'), options, options.at(-2)?.value ?? options[0]?.value ?? '');
  setSelectOptions(element<HTMLSelectElement>('#comparison-to'), options, options.at(-1)?.value ?? options[0]?.value ?? '');
  element<HTMLButtonElement>('#compare-materials-button').disabled = versions.length < 2;
}

function renderMaterialsWorkspace(data: ApplicationMaterialsWorkspace, preferred?: ApplicationMaterialVersion): void {
  materialsWorkspace = data;
  const reportSelect = element<HTMLSelectElement>('#material-report');
  const currentReport = preferred?.reportName ?? reportSelect.value;
  setSelectOptions(reportSelect, [
    { value: '', label: '请选择报告' },
    ...data.reports.map((report) => ({ value: report.name, label: `${report.company || '未知公司'} · ${report.role || report.title} · ${report.score || '未评分'}` })),
  ], currentReport);
  setText('#latex-compiler-state', data.latexCompilerAvailable ? 'LaTeX 编译器可用' : '未安装 LaTeX 编译器 · 仍会生成 .tex');
  if (preferred) activeMaterialVersion = preferred;
  else if (activeMaterialVersion) {
    const previousKey = materialVersionKey(activeMaterialVersion);
    activeMaterialVersion = data.versions.find((version) => materialVersionKey(version) === previousKey) ?? data.versions[0] ?? null;
  }
  else activeMaterialVersion = data.versions[0] ?? null;
  renderMaterialHistory();
  renderActiveMaterialVersion();
  updateMaterialReportSummary();
  const packages = [...new Set(data.versions.map((version) => version.packageId))];
  const selectedPackage = activeMaterialVersion?.packageId ?? element<HTMLSelectElement>('#comparison-package').value;
  setSelectOptions(element<HTMLSelectElement>('#comparison-package'), packages.flatMap((packageId) => {
    const version = data.versions.find((candidate) => candidate.packageId === packageId);
    return version ? [{ value: packageId, label: `${version.company} · ${version.role}` }] : [];
  }), selectedPackage);
  updateComparisonVersionOptions();
}

async function loadMaterialsWorkspace(showErrors = true): Promise<void> {
  try {
    renderMaterialsWorkspace(await window.careerOps.getApplicationMaterialsWorkspace());
  } catch (error) {
    if (showErrors) showNotice(error instanceof Error ? error.message : '无法读取申请材料历史。', 'error');
  }
}

async function generateMaterials(): Promise<void> {
  const button = element<HTMLButtonElement>('#generate-materials-button');
  button.disabled = true;
  setText('#material-generation-state', '模型生成并核验事实中…');
  try {
    const result = await window.careerOps.generateApplicationMaterials({
      reportName: element<HTMLSelectElement>('#material-report').value,
      motivation: inputValue('#material-motivation'),
      companyContext: inputValue('#material-company-context'),
      firstMove: inputValue('#material-first-move'),
      tone: element<HTMLSelectElement>('#material-tone').value as ApplicationMaterialTone,
      hiringManager: inputValue('#material-hiring-manager'),
      versionNote: inputValue('#material-version-note'),
      pageFormat: element<HTMLSelectElement>('#material-page-format').value as 'auto' | 'a4' | 'letter',
      overrideLowScore: element<HTMLInputElement>('#material-low-score-override').checked,
    });
    if (result.ok === false) {
      setText('#material-generation-state', `失败 · ${result.stage}`);
      showNotice(result.message, 'error');
      return;
    }
    activeMaterialTab = 'artifacts';
    renderMaterialsWorkspace(result.workspace, result.version);
    setText('#material-generation-state', `${result.version.versionLabel} 已完成`);
    showNotice(`申请材料已保存到 output/application-materials/${result.version.packageId}/${result.version.versionLabel}/。`);
  } catch (error) {
    setText('#material-generation-state', '生成失败');
    showNotice(error instanceof Error ? error.message : '申请材料生成失败。', 'error');
  } finally {
    button.disabled = false;
  }
}

function renderMaterialComparison(comparison: MaterialComparison): void {
  const container = element('#comparison-result');
  clear(container);
  if (!comparison.changes.length) {
    container.append(make('p', '', '这两个版本的可比较内容完全相同。'));
    return;
  }
  comparison.changes.forEach((change) => {
    const section = make('section', 'comparison-file');
    section.append(make('strong', '', change.artifact));
    const columns = make('div', 'comparison-columns');
    const removed = make('div'); removed.append(make('span', '', `删除 ${change.removed.length}`));
    change.removed.forEach((line) => removed.append(make('code', 'removed', line)));
    const added = make('div'); added.append(make('span', '', `新增 ${change.added.length}`));
    change.added.forEach((line) => added.append(make('code', 'added', line)));
    columns.append(removed, added); section.append(columns); container.append(section);
  });
}

async function compareMaterials(): Promise<void> {
  try {
    const packageId = element<HTMLSelectElement>('#comparison-package').value;
    const from = Number(element<HTMLSelectElement>('#comparison-from').value);
    const to = Number(element<HTMLSelectElement>('#comparison-to').value);
    if (from === to) throw new Error('请选择两个不同版本。');
    renderMaterialComparison(await window.careerOps.compareApplicationMaterialVersions(packageId, from, to));
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '版本比较失败。', 'error');
  }
}

async function openMaterial(relativePath: string): Promise<void> {
  if (!activeMaterialVersion) return;
  try {
    const result = await window.careerOps.openApplicationMaterial(activeMaterialVersion.packageId, activeMaterialVersion.version, relativePath);
    if (!result.ok) throw new Error(result.message || 'macOS 无法打开该文件。');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '无法打开申请材料。', 'error');
  }
}

function scoreTone(score: string): string {
  const numeric = Number.parseFloat(score);
  if (Number.isNaN(numeric)) return 'neutral';
  if (numeric >= 4) return 'good';
  if (numeric >= 3) return 'review';
  return 'low';
}

function appendTrackerRow(body: HTMLElement, application: TrackerApplication): void {
  const row = document.createElement('tr');
  row.append(make('td', 'mono-cell', application.number || '—'));
  const identity = make('td', 'application-identity');
  identity.append(make('strong', '', application.company || '未知公司'), make('span', '', application.role || '未命名岗位'));
  row.append(identity);
  const scoreCell = make('td');
  scoreCell.append(make('span', `score-pill ${scoreTone(application.score)}`, application.score || '—'));
  row.append(scoreCell);
  const statusCell = make('td');
  statusCell.append(make('span', 'status-pill', application.status || 'Unknown'));
  row.append(statusCell);
  row.append(make('td', '', application.date || '—'));
  row.append(make('td', 'pdf-cell', application.pdf || '—'));
  body.append(row);
}

function renderTracker(data: CareerOpsSnapshot): void {
  setText('#nav-tracker-count', data.tracker.total);
  const statuses = element('#tracker-statuses');
  clear(statuses);
  Object.entries(data.tracker.byStatus).forEach(([status, count]) => {
    const chip = make('span', 'status-summary');
    chip.append(make('strong', '', String(count)), document.createTextNode(status));
    statuses.append(chip);
  });

  const body = element('#tracker-body');
  clear(body);
  data.tracker.applications.forEach((application) => appendTrackerRow(body, application));
  element('#tracker-empty').classList.toggle('hidden', data.tracker.total > 0);
  renderTrackerSelectors(data.tracker.applications);
}

function renderTrackerSelectors(applications: TrackerApplication[]): void {
  const selections = ['#tracker-status-row', '#outcome-row'];
  selections.forEach((selector) => {
    const select = element<HTMLSelectElement>(selector);
    const current = select.value;
    clear(select);
    if (!applications.length) {
      const option = make('option', '', '没有可用申请记录') as HTMLOptionElement;
      option.value = '';
      select.append(option);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    applications.forEach((application) => {
      const option = make('option', '', `#${application.number} · ${application.company} — ${application.role}`) as HTMLOptionElement;
      option.value = application.number;
      select.append(option);
    });
    if (applications.some((application) => application.number === current)) select.value = current;
  });
}

function renderLifecycleValue(selector: string, value: unknown): void {
  element(selector).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function refreshFollowupCadence(): Promise<void> {
  const output = element('#followup-output');
  output.textContent = '正在调用 career-ops 计算跟进节奏…';
  try {
    const cadence: FollowupCadenceResult = await window.careerOps.getFollowupCadence();
    renderLifecycleValue('#followup-output', cadence);
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : '无法读取跟进节奏。';
  }
}

async function submitTrackerStatus(): Promise<void> {
  const rowNumber = element<HTMLSelectElement>('#tracker-status-row').value;
  const status = element<HTMLSelectElement>('#tracker-status-value').value as TrackerStatus;
  if (!rowNumber) return showNotice('请先选择一条 Tracker 记录。', 'error');
  if (!window.confirm(`确认将 #${rowNumber} 更新为 ${status}？career-ops 将写入状态日志。`)) return;
  try {
    const result = await window.careerOps.updateTrackerStatus({
      rowNumber, status,
      note: inputValue('#tracker-status-note'), occurredOn: inputValue('#tracker-status-date'),
    });
    renderSnapshot(result.snapshot);
    showNotice(result.message);
    void refreshFollowupCadence();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '状态更新失败。', 'error');
  }
}

async function createFollowup(): Promise<void> {
  const rowNumber = element<HTMLSelectElement>('#tracker-status-row').value;
  if (!rowNumber) return showNotice('请先选择一条 Tracker 记录。', 'error');
  if (!window.confirm(`确认通过 career-ops 为 #${rowNumber} 建立跟进提醒？`)) return;
  try {
    const result = await window.careerOps.seedFollowup(rowNumber);
    renderSnapshot(result.snapshot);
    showNotice(result.message);
    void refreshFollowupCadence();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '建立跟进提醒失败。', 'error');
  }
}

async function analyzePastedReply(): Promise<void> {
  const resultElement = element('#reply-result');
  resultElement.textContent = '正在通过 career-ops 写入候选队列并匹配…';
  element<HTMLButtonElement>('#apply-reply-suggestion-button').classList.add('hidden');
  currentReplyRecommendation = null;
  try {
    const recommendation = await window.careerOps.analyzeReply({
      from: inputValue('#reply-from'), subject: inputValue('#reply-subject'), body: inputValue('#reply-body'),
    });
    currentReplyRecommendation = recommendation;
    renderLifecycleValue('#reply-result', {
      classification: recommendation.classification,
      match: recommendation.match,
      note: recommendation.canApplySuggestedStatus
        ? '这只是建议；请点击“确认应用建议状态”才会调用 set-status.mjs。'
        : '没有足够明确的匹配或建议状态，Tracker 不会被修改。',
    });
    element<HTMLButtonElement>('#apply-reply-suggestion-button').classList.toggle('hidden', !recommendation.canApplySuggestedStatus);
  } catch (error) {
    resultElement.textContent = error instanceof Error ? error.message : '回复分析失败。';
  }
}

async function applyReplyRecommendation(): Promise<void> {
  const recommendation = currentReplyRecommendation;
  if (!recommendation?.canApplySuggestedStatus || !recommendation.match.applicationNumber) return;
  const status = recommendation.classification.suggestedTrackerUpdate as TrackerStatus;
  if (!window.confirm(`确认将 #${recommendation.match.applicationNumber} 更新为 ${status}？此操作不会发送邮件。`)) return;
  try {
    const result = await window.careerOps.updateTrackerStatus({
      rowNumber: recommendation.match.applicationNumber,
      status,
      note: `Reply classification: ${recommendation.classification.type}`,
    });
    renderSnapshot(result.snapshot);
    element<HTMLButtonElement>('#apply-reply-suggestion-button').classList.add('hidden');
    showNotice(result.message);
    void refreshFollowupCadence();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '应用状态建议失败。', 'error');
  }
}

async function matchPastedInvite(): Promise<void> {
  const resultElement = element('#invite-result');
  resultElement.textContent = '正在调用 career-ops 匹配面试邀请…';
  try {
    const result = await window.careerOps.matchInvite(inputValue('#invite-text'));
    renderLifecycleValue('#invite-result', result);
    const first = result.candidates[0];
    if (first?.appNumber) {
      element<HTMLSelectElement>('#outcome-row').value = String(first.appNumber);
      element<HTMLSelectElement>('#tracker-status-row').value = String(first.appNumber);
    }
  } catch (error) {
    resultElement.textContent = error instanceof Error ? error.message : '面试邀请匹配失败。';
  }
}

async function submitOutcome(): Promise<void> {
  const rowNumber = element<HTMLSelectElement>('#outcome-row').value;
  const outcomeType = element<HTMLSelectElement>('#outcome-type').value as Parameters<typeof window.careerOps.recordOutcome>[0]['outcomeType'];
  if (!rowNumber) return showNotice('请先选择一条 Tracker 记录。', 'error');
  if (!window.confirm(`确认归档 #${rowNumber} 的“${outcomeType}”结果？career-ops 会保存结果和同步 Tracker。`)) return;
  try {
    const result = await window.careerOps.recordOutcome({
      rowNumber, outcomeType, stage: inputValue('#outcome-stage'), feedback: inputValue('#outcome-feedback'),
    });
    renderSnapshot(result.snapshot);
    showNotice(result.message);
    void refreshFollowupCadence();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '结果归档失败。', 'error');
  }
}

function reportButton(report: ReportSummary): HTMLButtonElement {
  const button = make('button', 'report-item') as HTMLButtonElement;
  button.type = 'button';
  button.dataset.report = report.name;
  button.classList.toggle('active', activeReport === report.name);
  const copy = make('span', 'report-item-copy');
  copy.append(make('strong', '', report.title), make('small', '', [
    report.company,
    report.role,
  ].filter(Boolean).join(' · ') || report.name));
  const meta = make('span', 'report-item-meta');
  meta.append(make('b', '', report.score || '未评分'), make('small', '', formatDate(report.modifiedAt)));
  button.append(copy, meta);
  return button;
}

function renderReports(data: CareerOpsSnapshot): void {
  setText('#nav-report-count', data.reports.length);
  const list = element('#report-list');
  clear(list);
  if (!data.reports.length) {
    const empty = make('div', 'empty-state inline');
    empty.append(make('span', '', '≡'), make('h3', '', '还没有评估报告'), make('p', '', 'reports/ 当前为空。本阶段不会运行 AI 评估。'));
    list.append(empty);
    return;
  }
  data.reports.forEach((report) => list.append(reportButton(report)));
}

function renderMetrics(data: CareerOpsSnapshot): void {
  setText('#metric-pending', data.pipeline.pending);
  setText('#metric-applications', data.tracker.total);
  setText('#metric-reports', data.reports.length);
  setText('#metric-targets', data.profileSummary.targetRoles.length);
}

function nullableNumberInput(selector: string): number | null {
  const value = element<HTMLInputElement>(selector).value.trim();
  return value ? Number(value) : null;
}

function renderAiSettings(settings: AiSettings): void {
  currentAiSettings = settings;
  const tabs = element('#model-service-tabs');
  clear(tabs);
  settings.services.forEach((service) => {
    const button = make('button', 'model-service-tab') as HTMLButtonElement;
    button.type = 'button';
    button.dataset.aiServiceId = service.id;
    button.classList.toggle('active', service.id === settings.activeServiceId);
    button.title = `${service.name} · ${service.model}`;
    button.append(make('i'), make('span', '', service.name));
    if (service.keyConfigured) button.append(make('small', '', 'Key'));
    tabs.append(button);
  });
  setInputValue('#model-service-name', settings.name);
  element<HTMLSelectElement>('#model-provider').value = settings.provider;
  setInputValue('#model-base-url', settings.baseUrl);
  setInputValue('#model-name', settings.model);
  setInputValue('#model-temperature', settings.temperature);
  setInputValue('#model-max-output', settings.maxOutputTokens);
  setInputValue('#model-timeout', settings.timeoutSeconds);
  setInputValue('#model-input-price', settings.inputPricePerMillion ?? '');
  setInputValue('#model-output-price', settings.outputPricePerMillion ?? '');
  element<HTMLInputElement>('#model-supports-vision').checked = settings.supportsVision;
  element<HTMLInputElement>('#model-api-key').value = '';
  element<HTMLInputElement>('#model-api-key').type = 'password';
  element('#model-connection-state').textContent = '尚未测试';
  element('#model-connection-state').className = '';
  const state = element('#model-key-state');
  state.textContent = settings.keyConfigured
    ? `已加密保存 · ••••${settings.keyHint}`
    : '未配置 Key';
  state.classList.toggle('configured', settings.keyConfigured);
  const status = element('#evaluation-model-status');
  status.textContent = settings.keyConfigured
    ? `${settings.name} · ${settings.model}`
    : '需要配置模型 Key';
  status.classList.toggle('configured', settings.keyConfigured);
  const materialStatus = element('#material-model-state');
  materialStatus.textContent = settings.keyConfigured
    ? `${settings.name} · ${settings.model} · Key ••••${settings.keyHint}`
    : '模型 Key 未配置';
  materialStatus.classList.toggle('configured', settings.keyConfigured);
  setText(
    '#key-security-copy',
    settings.encryptionAvailable
      ? 'Key 使用 macOS 安全存储加密；渲染界面无法读取原文。'
      : 'macOS 安全存储当前不可用，软件将拒绝保存 Key。',
  );
  element<HTMLButtonElement>('#clear-model-key-button').disabled = !settings.keyConfigured;
  element<HTMLButtonElement>('#delete-model-service-button').disabled = settings.services.length <= 1;
}

async function loadAiSettings(): Promise<void> {
  try {
    renderAiSettings(await window.careerOps.getAiSettings());
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '无法读取模型设置。', 'error');
  }
}

async function saveModelSettings(clearKey = false): Promise<void> {
  if (!currentAiSettings) return;
  const button = element<HTMLButtonElement>('#save-model-settings-button');
  button.disabled = true;
  try {
    const apiKey = element<HTMLInputElement>('#model-api-key').value;
    const settings = await window.careerOps.saveAiSettings({
      serviceId: currentAiSettings.activeServiceId,
      name: inputValue('#model-service-name'),
      provider: element<HTMLSelectElement>('#model-provider').value as AiSettings['provider'],
      baseUrl: inputValue('#model-base-url'),
      model: inputValue('#model-name'),
      temperature: readNumber('#model-temperature'),
      maxOutputTokens: readNumber('#model-max-output'),
      timeoutSeconds: readNumber('#model-timeout'),
      supportsVision: element<HTMLInputElement>('#model-supports-vision').checked,
      inputPricePerMillion: nullableNumberInput('#model-input-price'),
      outputPricePerMillion: nullableNumberInput('#model-output-price'),
      apiKey: clearKey ? undefined : apiKey,
      clearKey,
    });
    renderAiSettings(settings);
    showNotice(clearKey ? 'API Key 已从安全存储中清除。' : '模型设置已安全保存。');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '模型设置保存失败。', 'error');
  } finally {
    button.disabled = false;
  }
}

function modelRequest() {
  if (!currentAiSettings) throw new Error('模型服务尚未加载。');
  return {
    serviceId: currentAiSettings.activeServiceId,
    provider: element<HTMLSelectElement>('#model-provider').value as AiSettings['provider'],
    baseUrl: inputValue('#model-base-url'),
    apiKey: element<HTMLInputElement>('#model-api-key').value || undefined,
  };
}

function setModelConnectionState(message: string, tone: 'neutral' | 'success' | 'error' = 'neutral'): void {
  const state = element('#model-connection-state');
  state.textContent = message;
  state.className = tone === 'neutral' ? '' : tone;
}

async function selectModelService(serviceId: string): Promise<void> {
  if (serviceId === currentAiSettings?.activeServiceId) return;
  try {
    renderAiSettings(await window.careerOps.selectAiService(serviceId));
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '无法切换模型服务。', 'error');
  }
}

async function createModelService(preset: AiServicePreset): Promise<void> {
  try {
    renderAiSettings(await window.careerOps.createAiService(preset));
    element('#model-preset-menu').classList.add('hidden');
    showNotice(`已新增 ${MODEL_PRESETS[preset].name} 服务，请填写 Key 后测试连接。`);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '无法新增模型服务。', 'error');
  }
}

function applyModelPreset(preset: AiServicePreset): void {
  const values = MODEL_PRESETS[preset];
  setInputValue('#model-service-name', values.name);
  element<HTMLSelectElement>('#model-provider').value = values.provider;
  setInputValue('#model-base-url', values.baseUrl);
  setInputValue('#model-name', values.model);
  setInputValue('#model-temperature', values.temperature);
  setInputValue('#model-max-output', values.maxOutputTokens);
  setInputValue('#model-timeout', values.timeoutSeconds);
  element<HTMLInputElement>('#model-supports-vision').checked = values.supportsVision;
  setModelConnectionState('预设已填入，尚未保存');
}

async function refreshModelList(): Promise<void> {
  const button = element<HTMLButtonElement>('#refresh-model-list-button');
  button.disabled = true;
  setModelConnectionState('正在读取模型列表…');
  try {
    const result = await window.careerOps.listAiModels(modelRequest());
    const options = element<HTMLDataListElement>('#model-options');
    options.replaceChildren(...result.models.map((model) => new Option(model, model)));
    setModelConnectionState(`已读取 ${result.models.length} 个模型`, 'success');
    if (!result.models.length) showNotice('服务连接成功，但没有返回可选模型。');
  } catch (error) {
    const message = error instanceof Error ? error.message : '模型列表读取失败。';
    setModelConnectionState(message, 'error');
    showNotice(message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function testModelConnection(): Promise<void> {
  const button = element<HTMLButtonElement>('#test-model-connection-button');
  button.disabled = true;
  setModelConnectionState('正在测试连接…');
  try {
    const result = await window.careerOps.testAiConnection(modelRequest());
    setModelConnectionState(`${result.message} · ${result.latencyMs} ms`, result.ok ? 'success' : 'error');
    if (!result.ok) showNotice(result.message, 'error');
  } catch (error) {
    const message = error instanceof Error ? error.message : '连接测试失败。';
    setModelConnectionState(message, 'error');
    showNotice(message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function deleteModelService(): Promise<void> {
  if (!currentAiSettings || currentAiSettings.services.length <= 1) return;
  const service = currentAiSettings.services.find((item) => item.id === currentAiSettings?.activeServiceId);
  if (!window.confirm(`确定删除“${service?.name ?? '当前服务'}”及其本机加密 Key 吗？`)) return;
  try {
    renderAiSettings(await window.careerOps.deleteAiService(currentAiSettings.activeServiceId));
    showNotice('模型服务已删除。');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '无法删除模型服务。', 'error');
  }
}

function setJobInputKind(kind: JobInputKind): void {
  jobInputKind = kind;
  document.querySelectorAll<HTMLButtonElement>('[data-job-input]').forEach((button) => {
    button.classList.toggle('active', button.dataset.jobInput === kind);
  });
  element('#job-url-field').classList.toggle('hidden', kind !== 'url');
  element('#job-jd-field').classList.toggle('hidden', kind !== 'jd');
}

function formatCost(evaluation: JobEvaluation): string {
  return evaluation.usage.estimatedCostUsd === null
    ? '未计算'
    : `$${evaluation.usage.estimatedCostUsd.toFixed(6)}`;
}

function renderJobEvaluation(evaluation: JobEvaluation): void {
  currentJobEvaluation = evaluation;
  element('#evaluation-error').classList.add('hidden');
  element('#evaluation-result').classList.remove('hidden');
  setText('#job-evaluation-score', evaluation.score.toFixed(1));
  setText('#job-evaluation-decision', `${evaluation.finalDecision} · ${evaluation.confidence} confidence`);
  setText('#job-evaluation-company', evaluation.company);
  setText('#job-evaluation-role', evaluation.role);
  setText('#job-evaluation-archetype', evaluation.archetype);
  setText('#job-evaluation-location', evaluation.location);
  setText('#job-liveness-status', evaluation.liveness.status);
  setText('#job-liveness-engine', evaluation.liveness.engine);
  setText('#job-model-name', evaluation.model.name);
  setText('#job-model-provider', evaluation.model.provider);
  setText('#job-token-count', evaluation.usage.totalTokens.toLocaleString());
  setText('#job-token-split', `${evaluation.usage.inputTokens} 输入 · ${evaluation.usage.outputTokens} 输出`);
  setText('#job-cost', formatCost(evaluation));
  setText('#job-pricing-source', evaluation.usage.pricingSource === 'user-configured' ? '按用户配置单价' : '未配置单价');
  setText('#job-evidence-count', evaluation.evidenceCount);
  setText('#job-report-number', evaluation.reportName.match(/^\d+/)?.[0] ?? '—');
  setText('#job-tracker-status', evaluation.trackerStatus === 'merged' ? 'Tracker 已登记' : 'Tracker 待合并');
  setText('#job-legitimacy-tier', evaluation.legitimacyTier);

  const blocks = element('#job-evaluation-blocks');
  clear(blocks);
  evaluation.blocks.forEach((block) => {
    const row = make('article', 'evaluation-block-row');
    const letter = make('span', 'evaluation-block-letter', block.id);
    const copy = make('div', 'evaluation-block-copy');
    copy.append(make('strong', '', block.title), make('p', '', block.summary));
    const evidence = make('div', 'evaluation-block-evidence');
    block.evidence.slice(0, 5).forEach((item) => {
      const source = make('code', '', `${item.source}: ${item.quote}`);
      source.title = item.quote;
      evidence.append(source);
    });
    if (!block.evidence.length) evidence.append(make('span', 'muted-copy', '没有通过核验的证据'));
    const blockScore = make('span', 'evaluation-block-score', block.score === null ? evaluation.legitimacyTier : `${block.score.toFixed(1)}/5`);
    row.append(letter, copy, evidence, blockScore);
    blocks.append(row);
  });

  const risks = element('#job-risk-summary');
  clear(risks);
  Object.entries(evaluation.riskSummary).forEach(([name, value]) => {
    const row = make('div', 'evaluation-risk-row');
    row.append(make('strong', '', name.replace(/_/g, ' ')), make('span', '', value));
    risks.append(row);
  });
  if (!Object.keys(evaluation.riskSummary).length) risks.append(make('p', 'muted-copy', '没有结构化风险摘要'));

  const errors = element('#job-evaluation-errors');
  clear(errors);
  evaluation.errors.forEach((error) => errors.append(make('li', '', error)));
  if (!evaluation.errors.length) errors.append(make('li', '', '没有记录错误或限制。'));
}

function renderJobEvaluationFailure(stage: string, message: string, detail: string): void {
  currentJobEvaluation = null;
  element('#evaluation-result').classList.add('hidden');
  element('#evaluation-error').classList.remove('hidden');
  setText('#evaluation-error-stage', stage);
  setText('#evaluation-error-title', message);
  setText('#evaluation-error-detail', detail);
}

async function runSingleJobEvaluation(): Promise<void> {
  if (!snapshot?.validation.valid || !ensureNoUnsavedChanges()) return;
  const button = element<HTMLButtonElement>('#run-job-evaluation-button');
  const input = jobInputKind === 'url' ? inputValue('#job-url-input') : inputValue('#job-jd-input');
  button.disabled = true;
  element('#evaluation-running').classList.remove('hidden');
  element('#evaluation-error').classList.add('hidden');
  element('#evaluation-result').classList.add('hidden');
  try {
    const result = await window.careerOps.evaluateJob({ inputKind: jobInputKind, input });
    if (result.ok === false) {
      renderJobEvaluationFailure(result.error.stage, result.error.message, result.error.detail);
      return;
    }
    renderSnapshot(result.snapshot);
    renderJobEvaluation(result.evaluation);
    showNotice(`评估报告已生成：${result.evaluation.reportRelativePath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '岗位评估失败。';
    renderJobEvaluationFailure('ipc', '评估未完成', message);
  } finally {
    button.disabled = false;
    element('#evaluation-running').classList.add('hidden');
  }
}

function renderRankList(selector: string, values: MarketCount[], total: number): void {
  const container = element(selector);
  clear(container);
  values.forEach((item) => {
    const row = make('div', 'rank-row');
    const copy = make('div');
    copy.append(make('span', '', item.label), make('strong', '', String(item.count)));
    const track = make('div', 'rank-track');
    const fill = make('i', 'rank-fill');
    fill.style.width = `${Math.max(4, Math.round((item.count / Math.max(total, 1)) * 100))}%`;
    track.append(fill);
    row.append(copy, track);
    container.append(row);
  });
  if (!values.length) container.append(make('p', 'empty-copy', '没有可用样本'));
}

function filteredAdvice(): CompetitivenessAdvice[] {
  if (!currentAnalysis) return [];
  return adviceFilter === 'all'
    ? currentAnalysis.advice
    : currentAnalysis.advice.filter((item) => item.surface === adviceFilter);
}

function renderAdvice(): void {
  const container = element('#analysis-advice');
  clear(container);
  filteredAdvice().forEach((item) => {
    const row = make('article', 'advice-row');
    row.dataset.priority = item.priority;
    const meta = make('div', 'advice-meta');
    meta.append(
      make('span', `surface-tag surface-${item.surface.toLocaleLowerCase()}`, item.surface),
      make('span', `priority-tag ${item.priority}`, item.priority),
    );
    const copy = make('div', 'advice-copy');
    copy.append(make('strong', '', item.title), make('p', '', item.detail));
    const evidence = make('div', 'advice-evidence');
    evidence.append(make('span', '', 'Evidence'));
    item.evidence.forEach((source) => evidence.append(make('code', '', source)));
    row.append(meta, copy, evidence);
    container.append(row);
  });
}

function renderAnalysis(analysis: CompetitivenessAnalysis): void {
  currentAnalysis = analysis;
  element('#analysis-loading').classList.add('hidden');
  element('#analysis-content').classList.remove('hidden');
  setText('#nav-analysis-score', analysis.score);
  setText('#analysis-score', analysis.score);
  setText('#analysis-score-label', analysis.scoreLabel);
  setText('#analysis-score-disclaimer', analysis.scoreDisclaimer);
  setText('#analysis-generated-at', formatDate(analysis.generatedAt));
  setText('#analysis-provider', analysis.provider.label);
  const aiButton = element<HTMLButtonElement>('#run-ai-analysis-button');
  aiButton.disabled = !analysis.provider.available;
  aiButton.title = analysis.provider.detail;

  const dimensions = element('#analysis-dimensions');
  clear(dimensions);
  analysis.dimensions.forEach((dimension) => {
    const row = make('article', 'dimension-row');
    const identity = make('div', 'dimension-identity');
    identity.append(make('strong', '', dimension.label), make('p', '', dimension.summary));
    const bar = make('div', 'dimension-bar');
    const fill = make('i');
    fill.style.width = `${Math.round((dimension.score / dimension.maximum) * 100)}%`;
    bar.append(fill);
    const score = make('span', 'dimension-score', `${dimension.score}/${dimension.maximum}`);
    row.append(identity, bar, score);
    dimensions.append(row);
  });

  const market = analysis.market;
  setText('#market-sample', market.sampleSize);
  setText('#market-target', market.targetRoleMatches);
  setText('#market-swiss', market.swissMatches);
  setText('#market-preferred', market.preferredRegionMatches);
  setText('#market-remote', market.remoteMatches);
  setText('#market-recent', market.recentMatches);
  setText('#market-latest', market.latestPostedAt ? `最新岗位 ${market.latestPostedAt}` : '没有发布日期');
  setText('#market-limitation', market.limitation);
  renderRankList('#market-locations', market.topLocations, market.sampleSize);
  renderRankList('#market-companies', market.topCompanies, market.sampleSize);
  renderRankList('#market-seniority', market.seniority, market.sampleSize);
  renderRankList('#market-sources', market.sourceCoverage, market.sampleSize);

  renderAdvice();
  setText('#positioning-headline', analysis.positioning.headline);
  setText('#positioning-statement', analysis.positioning.statement);
  const strengths = element('#positioning-strengths');
  clear(strengths);
  analysis.positioning.strengths.forEach((strength) => {
    const row = make('div', 'positioning-strength');
    row.append(make('strong', '', strength.text), make('code', '', strength.evidence));
    strengths.append(row);
  });
  const limitations = element('#analysis-limitations');
  clear(limitations);
  [...new Set(analysis.limitations)].forEach((limitation) => {
    limitations.append(make('li', '', limitation));
  });
  const checkbox = element<HTMLInputElement>('#positioning-confirm-checkbox');
  checkbox.checked = false;
  element<HTMLButtonElement>('#confirm-positioning-button').disabled = true;
}

async function loadAnalysis(useAi = false): Promise<void> {
  if (!snapshot?.validation.valid) return;
  if (!ensureNoUnsavedChanges()) return;
  const loading = element('#analysis-loading');
  loading.textContent = useAi
    ? '正在依据已验证证据与市场样本分析…'
    : '正在读取 CV、Profile 与岗位样本…';
  loading.classList.remove('hidden');
  element('#analysis-content').classList.add('hidden');
  const refreshButton = element<HTMLButtonElement>('#refresh-analysis-button');
  const aiButton = element<HTMLButtonElement>('#run-ai-analysis-button');
  refreshButton.disabled = true;
  aiButton.disabled = true;
  try {
    const analysis = useAi
      ? await window.careerOps.runAiCompetitivenessAnalysis()
      : await window.careerOps.getCompetitivenessAnalysis();
    renderAnalysis(analysis);
  } catch (error) {
    loading.textContent = '分析暂不可用';
    showNotice(error instanceof Error ? error.message : '无法生成竞争力分析。', 'error');
  } finally {
    refreshButton.disabled = false;
    if (currentAnalysis) aiButton.disabled = !currentAnalysis.provider.available;
  }
}

async function confirmPositioningChanges(): Promise<void> {
  if (!snapshot || !currentAnalysis) return;
  const button = element<HTMLButtonElement>('#confirm-positioning-button');
  button.disabled = true;
  try {
    const result = await window.careerOps.confirmPositioning({
      analysisId: currentAnalysis.id,
      expectedRevision: snapshot.profile.revision,
    });
    if (result.ok === false) {
      showNotice(result.message, 'error');
      return;
    }
    renderSnapshot(result.snapshot);
    currentAnalysis = null;
    showNotice(`个人定位已确认写入；原配置备份于 ${result.backupDirectory}。`);
    await loadAnalysis();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '个人定位写入失败。', 'error');
  }
}

function renderSnapshot(data: CareerOpsSnapshot): void {
  snapshot = data;
  currentAnalysis = null;
  setText('#nav-analysis-score', '—');
  element('#analysis-loading').classList.remove('hidden');
  element('#analysis-content').classList.add('hidden');
  renderValidation(data);
  renderMetrics(data);
  renderProfile(data);
  renderCv(data);
  renderPipeline(data);
  renderTracker(data);
  renderReports(data);
  setText('#nav-batch-count', data.pipeline.pending);
  setText('#batch-pending-count', data.pipeline.pending);
}

function inputValue(selector: string): string {
  return element<HTMLInputElement | HTMLTextAreaElement>(selector).value.trim();
}

function readProfileEditor(): ProfileEditor {
  return {
    fullName: inputValue('#field-full-name'),
    headline: inputValue('#field-headline'),
    location: inputValue('#field-location'),
    email: inputValue('#field-email'),
    phone: inputValue('#field-phone'),
    targetRoles: lines(inputValue('#field-target-roles')),
    country: inputValue('#field-country'),
    city: inputValue('#field-city'),
    timezone: inputValue('#field-timezone'),
    maxPostingAgeDays: Number(inputValue('#field-max-age')),
    compensationMinimum: inputValue('#field-minimum'),
    compensationTargetRange: inputValue('#field-target-range'),
    compensationCurrency: inputValue('#field-currency'),
    locationFlexibility: inputValue('#field-location-flexibility'),
    preferredRegions: lines(inputValue('#field-preferred-regions')),
    workArrangements: checkedValues('work-arrangement'),
    employmentTypes: checkedValues('employment-type'),
    otherRequirements: lines(inputValue('#field-other-requirements')),
    automaticSubmission: false,
  };
}

function updateVerificationFromControl(target: HTMLElement): void {
  const row = target.closest<HTMLElement>('[data-fact-id]');
  const field = target.dataset.verificationField as 'status' | 'evidence' | 'note' | undefined;
  if (!row?.dataset.factId || !field) return;
  const item = verificationDraft.find((candidate) => candidate.id === row.dataset.factId);
  if (!item) return;
  const value = (target as HTMLInputElement | HTMLSelectElement).value;
  if (field === 'status') {
    item.status = value as VerificationStatus;
    row.dataset.status = item.status;
    renderVerificationCounts();
  } else {
    item[field] = value;
  }
}

function downgradeLinkedFact(target: HTMLElement): void {
  if (target.dataset.verificationField) return;
  const source = target.closest<HTMLElement>('[data-fact-id]');
  const id = source?.dataset.factId;
  if (!id) return;
  const item = verificationDraft.find((candidate) => candidate.id === id);
  if (!item || item.status !== 'verified') return;
  item.status = 'needs_review';
  const select = element<HTMLSelectElement>(
    `.verification-row[data-fact-id="${CSS.escape(id)}"] select`,
  );
  select.value = 'needs_review';
  select.closest<HTMLElement>('.verification-row')?.setAttribute('data-status', 'needs_review');
  renderVerificationCounts();
}

function ensureNoUnsavedChanges(): boolean {
  if (!profileDirty && !cvDirty && !portalDirty) return true;
  showNotice('存在未保存修改。请先保存资料、CV 或 Portal，再重新读取或切换工作区。', 'error');
  return false;
}

async function savePortalChanges(): Promise<void> {
  if (!atsWorkspace || !portalDirty) return;
  const button = element<HTMLButtonElement>('#save-portals-button');
  button.disabled = true;
  try {
    const result: PortalSaveResult = await window.careerOps.savePortals({
      expectedRevision: atsWorkspace.portals.revision,
      entries: portalDraft.map((entry) => ({ ...entry })),
      filters: readPortalFilters(),
    });
    if (result.ok === false) {
      showNotice(result.kind === 'conflict' ? `${result.message} 当前编辑内容没有被覆盖。` : result.message, 'error');
      return;
    }
    atsWorkspace = { ...atsWorkspace, portals: result.portals };
    renderAtsWorkspace(atsWorkspace);
    const state = element('#portal-save-state');
    state.textContent = '已安全保存'; state.className = 'save-state saved';
    showNotice(`Portal 已保存；原版本备份于 ${result.backupDirectory}。`);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Portal 保存失败。', 'error');
  } finally {
    button.disabled = !portalDirty;
  }
}

function readScanRequest(): ScanRequest {
  if (scanMode === 'quick') {
    return {
      kind: 'quick',
      dryRun: element<HTMLInputElement>('#quick-dry-run').checked,
      verify: element<HTMLInputElement>('#quick-verify').checked,
      company: element<HTMLSelectElement>('#quick-scan-company').value,
      postedAfter: inputValue('#quick-posted-after'),
      postedBefore: inputValue('#quick-posted-before'),
    };
  }
  const limit = inputValue('#full-limit');
  return {
    kind: 'full',
    dryRun: element<HTMLInputElement>('#full-dry-run').checked,
    liveness: element<HTMLInputElement>('#full-liveness').checked,
    sinceDays: Number(inputValue('#full-since-days')),
    limit: limit ? Number(limit) : null,
    ats: checkedValues('full-ats') as Array<'greenhouse' | 'lever' | 'ashby' | 'workday' | 'icims'>,
    resume: element<HTMLInputElement>('#full-resume').checked,
    includeUndated: element<HTMLInputElement>('#full-include-undated').checked,
  };
}

async function runScan(): Promise<void> {
  if (portalDirty) {
    showNotice('Portal 配置有未保存修改，请先保存再运行扫描。', 'error');
    return;
  }
  try {
    const run = await window.careerOps.startScan(readScanRequest());
    renderScanStatus(run);
    if (scanTimer !== null) window.clearInterval(scanTimer);
    scanTimer = window.setInterval(() => { void pollScanStatus(); }, 700);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '无法启动扫描。', 'error');
  }
}

function setScanMode(mode: ScanRequest['kind']): void {
  scanMode = mode;
  document.querySelectorAll<HTMLButtonElement>('[data-scan-mode]').forEach((button) => button.classList.toggle('active', button.dataset.scanMode === mode));
  element('#quick-scan-controls').classList.toggle('hidden', mode !== 'quick');
  element('#full-scan-controls').classList.toggle('hidden', mode !== 'full');
  element('#start-scan-button').textContent = mode === 'quick' ? '开始 Portal 扫描' : '开始全量反向扫描';
}

async function saveProfileChanges(): Promise<void> {
  if (!snapshot || !profileDirty) return;
  const button = element<HTMLButtonElement>('#save-profile-button');
  button.disabled = true;
  try {
    const result: SaveResult = await window.careerOps.saveProfile({
      expectedRevision: snapshot.profile.revision,
      profile: readProfileEditor(),
      verification: verificationDraft.map((item) => ({ ...item })),
    });
    if (result.ok === false) {
      showNotice(
        result.kind === 'conflict'
          ? `${result.message} 当前表单没有被覆盖。`
          : result.message,
        'error',
      );
      return;
    }
    renderSnapshot(result.snapshot);
    const state = element('#profile-save-state');
    state.textContent = '已安全保存';
    state.className = 'save-state saved';
    showNotice(`资料已保存；原版本备份于 ${result.backupDirectory}。`);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '资料保存失败。', 'error');
  } finally {
    button.disabled = !profileDirty;
  }
}

async function saveCvChanges(): Promise<void> {
  if (!snapshot || !cvDirty) return;
  const button = element<HTMLButtonElement>('#save-cv-button');
  button.disabled = true;
  try {
    const result: SaveResult = await window.careerOps.saveCv({
      expectedRevision: snapshot.cv.revision,
      content: element<HTMLTextAreaElement>('#cv-document').value,
    });
    if (result.ok === false) {
      showNotice(
        result.kind === 'conflict'
          ? `${result.message} 当前编辑内容没有被覆盖。`
          : result.message,
        'error',
      );
      return;
    }
    renderSnapshot(result.snapshot);
    const state = element('#cv-save-state');
    state.textContent = '已安全保存';
    state.className = 'save-state saved';
    showNotice(`CV 已保存；原版本备份于 ${result.backupDirectory}。`);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'CV 保存失败。', 'error');
  } finally {
    button.disabled = !cvDirty;
  }
}

async function loadSnapshot(force = false): Promise<void> {
  if (!force && !ensureNoUnsavedChanges()) return;
  element<HTMLButtonElement>('#refresh-button').disabled = true;
  try {
    const data = await window.careerOps.getSnapshot();
    renderSnapshot(data);
    await loadAnalysis();
    if (atsWorkspace) await loadAtsWorkspaceView(false);
    if (materialsWorkspace) await loadMaterialsWorkspace(false);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '无法读取 career-ops 工作区。', 'error');
  } finally {
    element<HTMLButtonElement>('#refresh-button').disabled = false;
  }
}

async function chooseDirectory(): Promise<void> {
  if (!ensureNoUnsavedChanges()) return;
  const button = element<HTMLButtonElement>('#choose-folder-button');
  button.disabled = true;
  try {
    const result = await window.careerOps.selectDirectory();
    if (!result.cancelled && result.snapshot) {
      renderSnapshot(result.snapshot);
      await loadAnalysis();
      atsWorkspace = null;
      portalDraft = [];
      setPortalDirty(false);
      materialsWorkspace = null;
      activeMaterialVersion = null;
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '无法选择文件夹。', 'error');
  } finally {
    button.disabled = false;
  }
}

async function showReport(name: string): Promise<void> {
  activeReport = name;
  if (snapshot) renderReports(snapshot);
  const documentNode = element('#report-document');
  const placeholder = element('#report-placeholder');
  try {
    const report = await window.careerOps.readReport(name);
    documentNode.textContent = report.content;
    documentNode.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } catch (error) {
    documentNode.textContent = '';
    documentNode.classList.add('hidden');
    placeholder.classList.remove('hidden');
    showNotice(error instanceof Error ? error.message : '无法读取报告。', 'error');
  }
}

function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.view as ViewName;
      switchView(view);
      if (view === 'analysis' && !currentAnalysis) void loadAnalysis();
      if (view === 'ats' && !atsWorkspace) void loadAtsWorkspaceView();
      if (view === 'automation' && !automationWorkspace) void loadAutomationWorkspace();
      if (view === 'materials' && !materialsWorkspace) void loadMaterialsWorkspace();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-view]').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.openView as ViewName));
  });
  element('#choose-folder-button').addEventListener('click', () => void chooseDirectory());
  element('#refresh-button').addEventListener('click', () => void loadSnapshot());
  element('#save-profile-button').addEventListener('click', () => void saveProfileChanges());
  element('#save-cv-button').addEventListener('click', () => void saveCvChanges());
  element('#save-portals-button').addEventListener('click', () => void savePortalChanges());
  element('#refresh-analysis-button').addEventListener('click', () => void loadAnalysis());
  element('#run-ai-analysis-button').addEventListener('click', () => void loadAnalysis(true));
  element('#positioning-confirm-checkbox').addEventListener('change', (event) => {
    element<HTMLButtonElement>('#confirm-positioning-button').disabled = !(
      event.currentTarget as HTMLInputElement
    ).checked;
  });
  element('#confirm-positioning-button').addEventListener('click', () => {
    void confirmPositioningChanges();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-job-input]').forEach((button) => {
    button.addEventListener('click', () => setJobInputKind(button.dataset.jobInput as JobInputKind));
  });
  element('#model-settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void saveModelSettings();
  });
  element('#clear-model-key-button').addEventListener('click', () => {
    if (window.confirm('确定要清除已加密保存的 API Key 吗？')) void saveModelSettings(true);
  });
  element('#model-service-tabs').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-ai-service-id]');
    if (button?.dataset.aiServiceId) void selectModelService(button.dataset.aiServiceId);
  });
  element('#add-model-service-button').addEventListener('click', (event) => {
    event.stopPropagation();
    element('#model-preset-menu').classList.toggle('hidden');
  });
  element('#model-preset-menu').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-create-model-preset]');
    if (button?.dataset.createModelPreset) void createModelService(button.dataset.createModelPreset as AiServicePreset);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-apply-model-preset]').forEach((button) => {
    button.addEventListener('click', () => applyModelPreset(button.dataset.applyModelPreset as AiServicePreset));
  });
  element('#toggle-model-key-button').addEventListener('click', () => {
    const input = element<HTMLInputElement>('#model-api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  element('#refresh-model-list-button').addEventListener('click', () => void refreshModelList());
  element('#test-model-connection-button').addEventListener('click', () => void testModelConnection());
  element('#delete-model-service-button').addEventListener('click', () => void deleteModelService());
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest('.model-add-row')) element('#model-preset-menu').classList.add('hidden');
  });
  element('#run-job-evaluation-button').addEventListener('click', () => void runSingleJobEvaluation());
  document.querySelectorAll<HTMLButtonElement>('[data-scan-mode]').forEach((button) => {
    button.addEventListener('click', () => setScanMode(button.dataset.scanMode as ScanRequest['kind']));
  });
  element('#start-scan-button').addEventListener('click', () => void runScan());
  element('#cancel-scan-button').addEventListener('click', async () => {
    renderScanStatus(await window.careerOps.cancelScan());
  });
  element('#refresh-automation-button').addEventListener('click', () => void loadAutomationWorkspace());
  element('#start-batch-button').addEventListener('click', () => void runBatch());
  element('#retry-failed-button').addEventListener('click', () => void runBatch({ retryFailed: true }));
  element('#resume-batch-button').addEventListener('click', () => void runBatch({ resumeIncomplete: true }));
  element('#cancel-batch-button').addEventListener('click', async () => {
    renderBatchStatus(await window.careerOps.cancelBatch(), automationWorkspace?.recentLog ?? []);
  });
  element('#daily-automation-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void saveDailySchedule();
  });
  element('#refresh-materials-button').addEventListener('click', () => void loadMaterialsWorkspace());
  element('#material-generator-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void generateMaterials();
  });
  element('#material-report').addEventListener('change', updateMaterialReportSummary);
  document.querySelectorAll<HTMLButtonElement>('[data-material-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      activeMaterialTab = button.dataset.materialTab as typeof activeMaterialTab;
      renderMaterialPreview();
    });
  });
  element('#material-preview').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-open-material]');
    if (button?.dataset.openMaterial) void openMaterial(button.dataset.openMaterial);
  });
  element('#material-history-list').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-material-version]');
    const version = materialsWorkspace?.versions.find((candidate) => materialVersionKey(candidate) === button?.dataset.materialVersion);
    if (!version) return;
    activeMaterialVersion = version;
    activeMaterialTab = 'artifacts';
    renderMaterialHistory();
    renderActiveMaterialVersion();
  });
  element('#comparison-package').addEventListener('change', updateComparisonVersionOptions);
  element('#compare-materials-button').addEventListener('click', () => void compareMaterials());
  document.querySelectorAll<HTMLButtonElement>('[data-ats-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('[data-ats-tab]').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
      document.querySelectorAll<HTMLElement>('.ats-tab-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== `ats-${button.dataset.atsTab}-panel`));
    });
  });
  element('#ats-job-search').addEventListener('input', renderAtsJobs);
  element('#ats-job-state').addEventListener('change', renderAtsJobs);
  element('#add-portal-button').addEventListener('click', () => {
    portalDraft.push({ id: `new:${crypto.randomUUID()}`, kind: 'company', name: '', provider: 'greenhouse', careersUrl: '', api: '', scanMethod: '', enabled: true, notes: '' });
    renderPortalEditor(); setPortalDirty(true);
    element('#portal-list').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  element('#portal-list').addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const row = target.closest<HTMLElement>('[data-portal-id]');
    const field = target.dataset.portalField as keyof PortalEntry | undefined;
    const entry = portalDraft.find((candidate) => candidate.id === row?.dataset.portalId);
    if (!entry || !field) return;
    if (field === 'enabled') entry.enabled = (target as HTMLInputElement).checked;
    else if (field === 'kind') entry.kind = target.value as PortalEntry['kind'];
    else if (['name', 'provider', 'careersUrl', 'api', 'scanMethod', 'notes'].includes(field)) (entry[field] as string) = target.value;
    setPortalDirty(true);
  });
  element('#portal-list').addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.dataset.portalField) target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  element('#portal-list').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-remove-portal]');
    if (!button?.dataset.removePortal) return;
    portalDraft = portalDraft.filter((entry) => entry.id !== button.dataset.removePortal);
    renderPortalEditor(); setPortalDirty(true);
  });
  element('#ats-filters-panel').addEventListener('input', () => setPortalDirty(true));
  element('#ats-filters-panel').addEventListener('change', () => setPortalDirty(true));
  element('#open-generated-report-button').addEventListener('click', () => {
    if (!currentJobEvaluation) return;
    switchView('reports');
    void showReport(currentJobEvaluation.reportName);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-advice-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      adviceFilter = button.dataset.adviceFilter as AdviceFilter;
      document.querySelectorAll('[data-advice-filter]').forEach((chip) => {
        chip.classList.toggle('active', chip === button);
      });
      renderAdvice();
    });
  });
  element('#profile-form').addEventListener('submit', (event) => event.preventDefault());
  element('#profile-form').addEventListener('input', (event) => {
    const target = event.target as HTMLElement;
    updateVerificationFromControl(target);
    downgradeLinkedFact(target);
    setProfileDirty(true);
  });
  element('#profile-form').addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    updateVerificationFromControl(target);
    downgradeLinkedFact(target);
    setProfileDirty(true);
  });
  element<HTMLTextAreaElement>('#cv-document').addEventListener('input', () => {
    setCvDirty(true);
  });
  element<HTMLInputElement>('#pipeline-search').addEventListener('input', (event) => {
    pipelineQuery = (event.currentTarget as HTMLInputElement).value;
    if (snapshot) renderPipeline(snapshot);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-pipeline-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      pipelineFilter = button.dataset.pipelineFilter as PipelineFilter;
      document.querySelectorAll('[data-pipeline-filter]').forEach((chip) => {
        chip.classList.toggle('active', chip === button);
      });
      if (snapshot) renderPipeline(snapshot);
    });
  });
  element('#tracker-status-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void submitTrackerStatus();
  });
  element('#seed-followup-button').addEventListener('click', () => void createFollowup());
  element('#refresh-followups-button').addEventListener('click', () => void refreshFollowupCadence());
  element('#reply-analysis-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void analyzePastedReply();
  });
  element('#apply-reply-suggestion-button').addEventListener('click', () => void applyReplyRecommendation());
  element('#match-invite-button').addEventListener('click', () => void matchPastedInvite());
  element('#outcome-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void submitOutcome();
  });
  element('#report-list').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-report]');
    if (button?.dataset.report) void showReport(button.dataset.report);
  });
}

bindEvents();
void loadAiSettings();
void window.careerOps.getScanStatus().then(renderScanStatus);
void loadSnapshot(true);
