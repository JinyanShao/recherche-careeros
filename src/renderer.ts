import './index.css';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/dialog/dialog.js';
import '@awesome.me/webawesome/dist/components/progress-bar/progress-bar.js';
import '@awesome.me/webawesome/dist/components/tooltip/tooltip.js';
import {
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  ClipboardList,
  Eye,
  FileText,
  Files,
  History,
  House,
  Inbox,
  ListRestart,
  Minus,
  Radar,
  RefreshCw,
  Settings,
  TriangleAlert,
  UserRound,
  X,
  createIcons,
} from 'lucide';
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
type NavigationSection = 'today' | 'jobs' | 'applications' | 'profile' | 'settings';
type NavigationRoute = {
  id: string;
  label: string;
  section: NavigationSection;
  view: ViewName;
  target?: 'jobs' | 'models' | 'sources' | 'schedule' | 'advanced';
};
type PipelineFilter = 'pending' | 'processed' | 'all';
type AdviceFilter = 'all' | 'CV' | 'LinkedIn' | 'GitHub' | 'Portfolio';
type VerificationFilter = 'attention' | 'verified' | 'all';
type GuidedAction = 'connect' | 'profile-details' | 'profile-cv' | 'settings-models';
type WorkbenchAction = 'evaluate' | 'prepare-materials' | 'mark-applied' | 'view-tracker' | 'view-materials';
type ConfirmationTone = 'brand' | 'danger';
type WebAwesomeDialog = HTMLElement & { open: boolean };
type WebAwesomeProgressBar = HTMLElement & { value: number };

const VIEW_META: Record<ViewName, { eyebrow: string; title: string }> = {
  overview: { eyebrow: '工作区状态', title: '今天的求职资料' },
  cv: { eyebrow: '我的资料', title: '简历' },
  profile: { eyebrow: '我的资料', title: '个人资料与求职方向' },
  analysis: { eyebrow: '市场定位', title: '竞争力与市场分析' },
  evaluation: { eyebrow: '岗位判断', title: '单岗位完整评估' },
  ats: { eyebrow: '岗位来源', title: '岗位发现中心' },
  automation: { eyebrow: '每日求职', title: '批量评分与自动化' },
  materials: { eyebrow: '申请准备', title: '申请材料与版本管理' },
  pipeline: { eyebrow: '岗位', title: '岗位收件箱' },
  tracker: { eyebrow: '申请状态', title: '申请追踪' },
  reports: { eyebrow: '评估产物', title: '岗位评估报告' },
};

const NAVIGATION: Record<NavigationSection, NavigationRoute[]> = {
  today: [{ id: 'today', label: '今天', section: 'today', view: 'overview' }],
  jobs: [
    { id: 'jobs-inbox', label: '收件箱', section: 'jobs', view: 'pipeline' },
    { id: 'jobs-discover', label: '发现', section: 'jobs', view: 'ats', target: 'jobs' },
    { id: 'jobs-evaluate', label: '评估岗位', section: 'jobs', view: 'evaluation' },
    { id: 'jobs-batch', label: '批量处理', section: 'jobs', view: 'automation' },
    { id: 'jobs-reports', label: '报告', section: 'jobs', view: 'reports' },
  ],
  applications: [
    { id: 'applications-tracker', label: '申请进度', section: 'applications', view: 'tracker' },
    { id: 'applications-materials', label: '申请材料', section: 'applications', view: 'materials' },
  ],
  profile: [
    { id: 'profile-details', label: '个人资料', section: 'profile', view: 'profile' },
    { id: 'profile-cv', label: '简历', section: 'profile', view: 'cv' },
    { id: 'profile-analysis', label: '竞争力', section: 'profile', view: 'analysis' },
  ],
  settings: [
    { id: 'settings-models', label: '模型与 API Key', section: 'settings', view: 'evaluation', target: 'models' },
    { id: 'settings-sources', label: '职位来源', section: 'settings', view: 'ats', target: 'sources' },
    { id: 'settings-automation', label: '自动化', section: 'settings', view: 'automation', target: 'schedule' },
    { id: 'settings-advanced', label: '高级', section: 'settings', view: 'automation', target: 'advanced' },
  ],
};

const ROUTE_META: Record<string, { eyebrow: string; title: string }> = {
  today: { eyebrow: '今天', title: '下一步该做什么' },
  'jobs-discover': { eyebrow: '岗位', title: '发现岗位' },
  'jobs-inbox': { eyebrow: '岗位', title: '岗位收件箱' },
  'jobs-evaluate': { eyebrow: '岗位', title: '评估一个岗位' },
  'jobs-batch': { eyebrow: '岗位', title: '批量处理' },
  'jobs-reports': { eyebrow: '岗位', title: '岗位报告' },
  'applications-tracker': { eyebrow: '申请', title: '申请进度' },
  'applications-materials': { eyebrow: '申请', title: '申请材料' },
  'profile-details': { eyebrow: '我的资料', title: '个人资料与求职方向' },
  'profile-cv': { eyebrow: '我的资料', title: '简历' },
  'profile-analysis': { eyebrow: '我的资料', title: '竞争力与职业定位' },
  'settings-models': { eyebrow: '设置', title: '模型与 API Key' },
  'settings-sources': { eyebrow: '设置', title: '职位来源与过滤' },
  'settings-automation': { eyebrow: '设置', title: '每日自动化' },
  'settings-advanced': { eyebrow: '设置', title: '批量任务与高级控制' },
};

const DEFAULT_ROUTE: Record<NavigationSection, string> = {
  today: 'today',
  jobs: 'jobs-inbox',
  applications: 'applications-tracker',
  profile: 'profile-details',
  settings: 'settings-models',
};

const DEFAULT_VIEW_ROUTE: Record<ViewName, string> = {
  overview: 'today',
  cv: 'profile-cv',
  profile: 'profile-details',
  analysis: 'profile-analysis',
  evaluation: 'jobs-evaluate',
  ats: 'jobs-discover',
  automation: 'jobs-batch',
  materials: 'applications-materials',
  pipeline: 'jobs-inbox',
  tracker: 'applications-tracker',
  reports: 'jobs-reports',
};

let snapshot: CareerOpsSnapshot | null = null;
let pipelineFilter: PipelineFilter = 'pending';
let pipelineQuery = '';
let activeReport = '';
let profileDirty = false;
let cvDirty = false;
let cvEditor: Crepe | null = null;
let cvEditorBaseline = '';
let cvEditorRenderId = 0;
let verificationDraft: VerificationItem[] = [];
let verificationFilter: VerificationFilter = 'attention';
const selectedVerificationIds = new Set<string>();
const expandedVerificationIds = new Set<string>();
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
let currentProfileNextRoute = 'profile-details';
let currentProfileNextTarget: 'verification' | null = null;
let currentJobsNextRoute = 'jobs-inbox';
let currentApplicationsNextRoute = 'applications-tracker';
let currentTodayNextRoute = 'jobs-discover';
let currentTodayChoosesFolder = false;
let selectedJobId = '';
let currentWorkbenchAction: WorkbenchAction = 'evaluate';
let currentWorkbenchReportName = '';
let currentWorkbenchTrackerRow = '';
let guidedSetupDismissed = false;
let currentGuidedAction: GuidedAction = 'connect';
let currentGuidedVerificationTarget = false;

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

const VALIDATION_LABELS: Record<string, string> = {
  agent: '系统完整性',
  scanner: '岗位搜索能力',
  cv: '简历',
  profile: '个人资料',
  pipeline: '岗位收件箱',
  tracker: '申请记录',
  reports: '岗位报告',
};

const ICONS = {
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  ClipboardList,
  Eye,
  FileText,
  Files,
  History,
  House,
  Inbox,
  ListRestart,
  Minus,
  Radar,
  RefreshCw,
  Settings,
  TriangleAlert,
  UserRound,
  X,
};

function renderIcons(): void {
  createIcons({ icons: ICONS, attrs: { 'aria-hidden': 'true' } });
}

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

function verificationSourceLabel(source: string): string {
  const normalized = source.toLowerCase();
  if (!source) return '来源待补充';
  if (normalized.includes('cv.md')) return '简历';
  if (normalized.includes('config/profile.yml')) return '个人资料';
  if (normalized.includes('github.com')) return 'GitHub';
  if (/^https?:\/\//i.test(source)) return sourceHost(source);
  if (normalized.includes('recherche')) return '已迁入资料';
  return '已有来源记录';
}

const VERIFICATION_ITEM_LABELS: Record<string, string> = {
  'identity.name': '姓名',
  'identity.headline': '职业定位',
  'identity.location': '当前地点',
  'preference.target_roles': '目标岗位',
  'language.french': '法语水平',
  'language.chinese': '中文水平',
  'language.english': '英语水平',
  'education.heia_fr': 'HEIA-FR 录取或入学状态',
  'work_authorization.switzerland': '瑞士工作许可',
  'preference.compensation': '薪资期望',
  'preference.work_arrangement': '远程、混合或现场偏好',
  'preference.availability': '到岗时间',
};

const VERIFICATION_CATEGORY_LABELS: Record<string, string> = {
  Identity: '个人信息',
  'Job preferences': '求职偏好',
  Languages: '语言',
  Experience: '工作经历',
  Projects: '项目',
  Education: '教育经历',
  Certifications: '证书',
  Constraints: '申请条件',
};

function verificationItemLabel(item: VerificationItem): string {
  return VERIFICATION_ITEM_LABELS[item.id] ?? item.label;
}

function verificationCategoryLabel(category: string): string {
  return VERIFICATION_CATEGORY_LABELS[category] ?? category;
}

function cvSummary(markdown: string): string {
  const match = markdown.match(/^## Summary\s*\n+([\s\S]*?)(?=\n##\s|$)/im);
  return match?.[1]?.replace(/\s+/g, ' ').trim()
    || '简历中尚未填写职业摘要。';
}

function showNotice(message: string, tone: 'info' | 'error' = 'info'): void {
  const notice = element('#notice');
  notice.textContent = message;
  notice.className = `notice ${tone}`;
  notice.setAttribute('variant', tone === 'error' ? 'danger' : 'brand');
}

function hideNotice(): void {
  element('#notice').className = 'notice hidden';
}

let confirmationResolver: ((confirmed: boolean) => void) | null = null;

function resolveConfirmation(confirmed: boolean): void {
  const resolve = confirmationResolver;
  confirmationResolver = null;
  element<WebAwesomeDialog>('#confirmation-dialog').open = false;
  resolve?.(confirmed);
}

function confirmAction(
  message: string,
  options: { title?: string; action?: string; tone?: ConfirmationTone } = {},
): Promise<boolean> {
  if (confirmationResolver) resolveConfirmation(false);
  const dialog = element<WebAwesomeDialog>('#confirmation-dialog');
  dialog.setAttribute('label', options.title ?? '确认操作');
  setText('#confirmation-message', message);
  setText('#confirmation-action', options.action ?? '确认');
  element('#confirmation-action').setAttribute('variant', options.tone ?? 'brand');
  return new Promise<boolean>((resolve) => {
    confirmationResolver = resolve;
    dialog.open = true;
  });
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
  element('#verification-save-reminder').classList.toggle('hidden', !dirty);
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

function allNavigationRoutes(): NavigationRoute[] {
  return Object.values(NAVIGATION).flat();
}

function renderContextNavigation(section: NavigationSection, activeRouteId: string): void {
  const container = element('#context-navigation');
  clear(container);
  const routes = NAVIGATION[section];
  container.classList.toggle('single-route', routes.length === 1);
  routes.forEach((route) => {
    const button = make('button', route.id === activeRouteId ? 'active' : '', route.label);
    button.type = 'button';
    button.dataset.route = route.id;
    if (route.id === activeRouteId) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => activateRoute(route.id));
    container.append(button);
  });
}

function revealRouteTarget(route: NavigationRoute): void {
  if (route.target === 'jobs') {
    document.querySelector<HTMLButtonElement>('[data-ats-tab="jobs"]')?.click();
  }
  if (route.target === 'sources') {
    const portalsTab = document.querySelector<HTMLButtonElement>('[data-ats-tab="portals"]');
    portalsTab?.click();
  }
  const selector = route.target === 'models'
    ? '#model-settings-form'
    : route.target === 'sources'
      ? '#ats-portals-panel'
      : route.target === 'schedule'
        ? '#daily-automation-form'
        : route.target === 'advanced'
          ? '#advanced-workspace-panel'
          : null;
  if (selector) {
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: 'start' }));
  }
}

function switchView(view: ViewName, section: NavigationSection, routeId: string): void {
  document.querySelectorAll<HTMLElement>('.view').forEach((node) => {
    node.classList.toggle('active', node.id === `${view}-view`);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach((button) => {
    const active = button.dataset.section === section;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.body.dataset.navigationSection = section;
  document.body.dataset.navigationRoute = routeId;
  renderContextNavigation(section, routeId);
  const routeMeta = ROUTE_META[routeId] ?? VIEW_META[view];
  setText('#view-eyebrow', routeMeta.eyebrow);
  setText('#view-title', routeMeta.title);
}

function activateRoute(routeId: string): void {
  const route = allNavigationRoutes().find((candidate) => candidate.id === routeId);
  if (!route) return;
  switchView(route.view, route.section, route.id);
  if (route.view === 'analysis' && !currentAnalysis) void loadAnalysis();
  if (route.view === 'ats' && !atsWorkspace) void loadAtsWorkspaceView();
  if (route.view === 'automation' && !automationWorkspace) void loadAutomationWorkspace();
  if (route.view === 'materials' && !materialsWorkspace) void loadMaterialsWorkspace();
  revealRouteTarget(route);
}

function navigateToView(view: ViewName): void {
  activateRoute(DEFAULT_VIEW_ROUTE[view]);
}

function profilePreparationState(data: CareerOpsSnapshot): {
  profileComplete: boolean;
  cvComplete: boolean;
  evidenceTotal: number;
  evidenceVerified: number;
  evidenceComplete: boolean;
  analysisComplete: boolean;
} {
  const editor = data.profileWorkspace.editor;
  const profileComplete = Boolean(
    editor.fullName.trim()
    && editor.headline.trim()
    && editor.location.trim()
    && editor.country.trim()
    && editor.targetRoles.length
    && editor.workArrangements.length
    && editor.employmentTypes.length
  );
  const cvComplete = data.cv.exists && data.cv.content.trim().length > 0;
  const evidenceTotal = data.profileWorkspace.verification.length;
  const evidenceVerified = data.profileWorkspace.verification.filter((item) => item.status === 'verified').length;
  const evidenceComplete = evidenceTotal > 0 && evidenceVerified === evidenceTotal;
  return {
    profileComplete,
    cvComplete,
    evidenceTotal,
    evidenceVerified,
    evidenceComplete,
    analysisComplete: currentAnalysis !== null,
  };
}

function setReadinessItem(id: 'profile' | 'cv' | 'evidence' | 'analysis', complete: boolean, label: string): void {
  const item = element('[data-readiness-item="' + id + '"]');
  item.classList.toggle('complete', complete);
  item.classList.toggle('attention', !complete);
  setText('#readiness-' + id + '-state', label);
}

function renderProfileReadiness(data: CareerOpsSnapshot): void {
  const {
    profileComplete,
    cvComplete,
    evidenceTotal,
    evidenceVerified,
    evidenceComplete,
    analysisComplete,
  } = profilePreparationState(data);
  const completed = [profileComplete, cvComplete, evidenceComplete, analysisComplete].filter(Boolean).length;

  setReadinessItem('profile', profileComplete, profileComplete ? '已就绪' : '需完善');
  setReadinessItem('cv', cvComplete, cvComplete ? '已就绪' : '需补充');
  setReadinessItem('evidence', evidenceComplete, evidenceTotal ? evidenceVerified + '/' + evidenceTotal : '待核对');
  setReadinessItem('analysis', analysisComplete, currentAnalysis ? currentAnalysis.score + '/100' : '待分析');
  setText('#profile-readiness-count', '资料准备 ' + completed + '/4');

  if (!profileComplete) {
    currentProfileNextRoute = 'profile-details';
    currentProfileNextTarget = null;
    setText('#profile-readiness-copy', '先补全职业定位、目标岗位和工作方式，让搜索条件保持准确。');
    setText('#profile-next-step-button', '完善个人资料');
  } else if (!cvComplete) {
    currentProfileNextRoute = 'profile-cv';
    currentProfileNextTarget = null;
    setText('#profile-readiness-copy', '个人资料已就绪，下一步补充用于匹配和生成材料的简历。');
    setText('#profile-next-step-button', '补充简历');
  } else if (!evidenceComplete) {
    currentProfileNextRoute = 'profile-details';
    currentProfileNextTarget = 'verification';
    setText('#profile-readiness-copy', '核对仍未确认的事实，避免评分和申请材料引用不可靠信息。');
    setText('#profile-next-step-button', '核对事实');
  } else {
    currentProfileNextRoute = 'profile-analysis';
    currentProfileNextTarget = null;
    setText(
      '#profile-readiness-copy',
      analysisComplete ? '基础资料已经就绪，可以查看竞争力分解和下一步优化建议。' : '资料已经就绪，下一步查看竞争力和市场建议。',
    );
    setText('#profile-next-step-button', analysisComplete ? '查看优化建议' : '分析竞争力');
  }
}


function renderGuidedSetup(data: CareerOpsSnapshot): void {
  const panel = element('#guided-setup');
  const {
    profileComplete,
    cvComplete,
    evidenceComplete,
  } = profilePreparationState(data);
  const modelReady = Boolean(currentAiSettings?.keyConfigured);
  const steps: Array<{
    label: string;
    detail: string;
    complete: boolean;
    action: GuidedAction;
    verification?: boolean;
  }> = [
    { label: '连接资料', detail: '读取现有求职记录', complete: data.validation.valid, action: 'connect' },
    { label: '个人资料与偏好', detail: '岗位、地点和工作方式', complete: profileComplete, action: 'profile-details' },
    { label: '简历', detail: '用于匹配和申请材料', complete: cvComplete, action: 'profile-cv' },
    { label: '事实核对', detail: '只让 AI 使用可靠信息', complete: evidenceComplete, action: 'profile-details', verification: true },
    { label: 'AI 模型', detail: currentAiSettings ? '安全保存自己的 API Key' : '正在检查模型设置', complete: modelReady, action: 'settings-models' },
  ];
  const completeCount = steps.filter((step) => step.complete).length;
  const ready = completeCount === steps.length;
  panel.hidden = guidedSetupDismissed || ready;
  if (panel.hidden) return;

  setText('#guided-progress-label', completeCount + '/5 已完成');
  element<HTMLElement>('#guided-progress-fill').style.width = Math.round((completeCount / steps.length) * 100) + '%';
  const container = element('#guided-steps');
  clear(container);
  const nextStep = steps.find((step) => !step.complete) ?? steps[0];
  steps.forEach((step, index) => {
    const row = make('article', step.complete ? 'complete' : step === nextStep ? 'current' : '');
    row.append(
      make('i', '', step.complete ? '✓' : String(index + 1)),
      make('strong', '', step.label),
      make('span', '', step.complete ? '已就绪' : step.detail),
    );
    container.append(row);
  });
  currentGuidedAction = nextStep.action;
  currentGuidedVerificationTarget = Boolean(nextStep.verification);
  const labels: Record<GuidedAction, string> = {
    connect: '连接现有资料',
    'profile-details': nextStep.verification ? '核对事实' : '完善个人资料',
    'profile-cv': '完善简历',
    'settings-models': '配置模型',
  };
  setText('#guided-next-button', labels[nextStep.action]);
}

function renderJobsWorkflow(data: CareerOpsSnapshot): void {
  const discovered = atsWorkspace?.totals.jobs ?? data.pipeline.total;
  const pending = data.pipeline.pending;
  const reports = data.reports.length;
  setText('#jobs-flow-discovered', discovered);
  setText('#jobs-flow-pending', pending);
  setText('#jobs-flow-reports', reports);

  if (pending > 0) {
    currentJobsNextRoute = 'jobs-inbox';
    setText('#jobs-flow-heading', pending + ' 个岗位等待评估');
    setText('#jobs-flow-copy', '在收件箱选择一个岗位直接评估，或使用批量处理。');
    setText('#jobs-next-step-button', '查看待评估岗位');
  } else if (discovered === 0) {
    currentJobsNextRoute = 'jobs-discover';
    setText('#jobs-flow-heading', '还没有发现岗位');
    setText('#jobs-flow-copy', '运行一次扫描，从已配置的招聘来源获取岗位。');
    setText('#jobs-next-step-button', '发现岗位');
  } else if (reports > 0) {
    currentJobsNextRoute = 'jobs-reports';
    setText('#jobs-flow-heading', reports + ' 份评估报告可查看');
    setText('#jobs-flow-copy', '查看评分、证据与风险，再决定是否准备申请。');
    setText('#jobs-next-step-button', '查看评估报告');
  } else {
    currentJobsNextRoute = 'jobs-discover';
    setText('#jobs-flow-heading', '继续寻找合适岗位');
    setText('#jobs-flow-copy', '当前收件箱已经处理完，可以获取最新岗位。');
    setText('#jobs-next-step-button', '发现更多岗位');
  }
}

function renderApplicationsWorkflow(data: CareerOpsSnapshot): void {
  const materialVersions = materialsWorkspace?.versions.length ?? 0;
  const trackerTotal = data.tracker.total;
  const terminalStatuses = new Set(['Hired', 'Rejected', 'Discarded', 'SKIP']);
  const activeApplications = data.tracker.applications.filter((application) => !terminalStatuses.has(application.status)).length;

  setText('#application-flow-reports', data.reports.length);
  setText('#application-flow-materials', materialVersions);
  setText('#application-flow-tracker', trackerTotal);
  setText('#application-flow-active', activeApplications);

  if (trackerTotal > 0) {
    currentApplicationsNextRoute = 'applications-tracker';
    setText('#application-flow-heading', activeApplications > 0 ? activeApplications + ' 个申请正在推进' : '查看已归档的申请');
    setText('#application-flow-copy', '更新状态、处理招聘回复，或查看下一次跟进建议。');
    setText('#applications-next-step-button', activeApplications > 0 ? '继续推进申请' : '查看申请记录');
  } else if (materialVersions > 0) {
    currentApplicationsNextRoute = 'applications-materials';
    setText('#application-flow-heading', materialVersions + ' 个材料版本已准备');
    setText('#application-flow-copy', '检查最终文件；实际投递后在申请进度中继续更新状态。');
    setText('#applications-next-step-button', '查看申请材料');
  } else if (data.reports.length > 0) {
    currentApplicationsNextRoute = 'applications-materials';
    setText('#application-flow-heading', data.reports.length + ' 个岗位可以准备申请');
    setText('#application-flow-copy', '选择已评估岗位，生成定制 CV、求职信和沟通草稿。');
    setText('#applications-next-step-button', '准备申请材料');
  } else {
    currentApplicationsNextRoute = 'jobs-evaluate';
    setText('#application-flow-heading', '先评估一个目标岗位');
    setText('#application-flow-copy', '申请材料和进度都会从已核验的岗位报告开始。');
    setText('#applications-next-step-button', '评估岗位');
  }
}

function renderTodayFocus(data: CareerOpsSnapshot): void {
  const {
    profileComplete: profileReady,
    cvComplete: cvReady,
    evidenceComplete: evidenceReady,
  } = profilePreparationState(data);
  const activeStatuses = new Set(['Applied', 'Responded', 'Interview', 'Offer']);
  const activeApplications = data.tracker.applications.filter((application) => activeStatuses.has(application.status)).length;
  const materialVersions = materialsWorkspace?.versions.length ?? 0;

  currentTodayChoosesFolder = false;
  if (!data.validation.valid) {
    currentTodayChoosesFolder = true;
    setText('#today-focus-heading', '选择你的求职资料库');
    setText('#today-focus-copy', '连接包含简历、个人资料和岗位数据的文件夹。');
    setText('#today-focus-context', '不会修改所选文件夹的系统层');
    setText('#today-next-step-button', '选择文件夹');
    return;
  }
  if (activeApplications > 0) {
    currentTodayNextRoute = 'applications-tracker';
    setText('#today-focus-heading', activeApplications + ' 个申请需要继续推进');
    setText('#today-focus-copy', '查看招聘回复、跟进时间或更新当前申请状态。');
    setText('#today-focus-context', '优先处理已经投递的岗位');
    setText('#today-next-step-button', '推进申请');
    return;
  }
  if (!profileReady || !cvReady || !evidenceReady) {
    currentTodayNextRoute = currentProfileNextRoute;
    setText('#today-focus-heading', '先把求职资料准备完整');
    setText('#today-focus-copy', element('#profile-readiness-copy').textContent || '完善岗位匹配需要的基础资料。');
    setText('#today-focus-context', element('#profile-readiness-count').textContent || '资料准备中');
    setText('#today-next-step-button', element('#profile-next-step-button').textContent || '继续准备资料');
    return;
  }
  if (currentAiSettings && !currentAiSettings.keyConfigured) {
    currentTodayNextRoute = 'settings-models';
    setText('#today-focus-heading', '连接一个 AI 模型');
    setText('#today-focus-copy', '岗位评分和申请材料需要模型服务；Key 只会加密保存在这台 Mac。');
    setText('#today-focus-context', '支持 OpenAI、Anthropic、DeepSeek 和兼容服务');
    setText('#today-next-step-button', '配置模型');
    return;
  }
  const recommendations = recommendedJobs(data);
  if (recommendations.length > 0) {
    currentTodayNextRoute = 'jobs-inbox';
    setText('#today-focus-heading', `${recommendations.length} 个岗位已完成评分`);
    setText('#today-focus-copy', `今日推荐已按评分从高到低排列，先查看 ${recommendations[0].company} 的 ${recommendations[0].role}。`);
    setText('#today-focus-context', '评分、公司信息和申请材料都在同一个岗位工作台');
    setText('#today-next-step-button', '查看今日推荐');
    return;
  }
  if (data.pipeline.pending > 0) {
    currentTodayNextRoute = 'jobs-inbox';
    setText('#today-focus-heading', data.pipeline.pending + ' 个新岗位等待评估');
    setText('#today-focus-copy', '先看最符合目标的岗位，再决定是否生成完整报告。');
    setText('#today-focus-context', '岗位来自已配置的招聘来源');
    setText('#today-next-step-button', '查看新岗位');
    return;
  }
  if (data.reports.length > materialVersions) {
    currentTodayNextRoute = 'applications-materials';
    setText('#today-focus-heading', '有已评估岗位可以准备申请');
    setText('#today-focus-copy', '从岗位报告生成定制 CV、求职信和沟通草稿。');
    setText('#today-focus-context', data.reports.length + ' 份报告 · ' + materialVersions + ' 个材料版本');
    setText('#today-next-step-button', '准备申请材料');
    return;
  }
  currentTodayNextRoute = 'jobs-discover';
  setText('#today-focus-heading', '获取今天的新岗位');
  setText('#today-focus-copy', '当前待处理任务已经完成，可以运行一次最新岗位扫描。');
  setText('#today-focus-context', '使用现有职位来源与筛选条件');
  setText('#today-next-step-button', '发现新岗位');
}

function prepareJobEvaluation(url: string): void {
  if (!url.trim()) return;
  const matchingJob = snapshot?.pipeline.jobs.find((job) => job.url === url);
  if (matchingJob) selectedJobId = matchingJob.id;
  setJobInputKind('url');
  setInputValue('#job-url-input', url);
  activateRoute('jobs-evaluate');
  window.requestAnimationFrame(() => element<HTMLInputElement>('#job-url-input').focus());
}

function renderValidation(data: CareerOpsSnapshot): void {
  const { validation } = data;
  document.body.dataset.workspaceValid = String(validation.valid);
  setText('#sidebar-root', validation.valid ? '资料已连接' : '尚未连接');
  setText('#advanced-workspace-path', validation.root);
  setText('#choose-folder-button', validation.valid ? '连接其他资料' : '连接现有资料');
  const ribbon = element('#validation-ribbon');
  ribbon.classList.toggle('invalid', !validation.valid);
  setText('#validation-title', validation.valid ? '求职资料库已连接' : '所选文件夹不是有效资料库');
  setText(
    '#validation-copy',
    validation.valid
      ? `资料已加载 · ${formatDate(data.loadedAt)} · 已启用安全写入`
      : '请选择包含简历、个人资料和岗位数据的文件夹',
  );
  const ledgerIcon = element('.ledger-icon');
  clear(ledgerIcon);
  const ledgerGlyph = make('i');
  ledgerGlyph.dataset.lucide = validation.valid ? 'badge-check' : 'triangle-alert';
  ledgerIcon.append(ledgerGlyph);
  const checks = element('#validation-checks');
  clear(checks);
  validation.checks.forEach((check) => {
    const chip = make('span', check.present ? 'check-chip ok' : check.required ? 'check-chip missing' : 'check-chip optional');
    const glyph = make('i');
    glyph.dataset.lucide = check.present ? 'check' : check.required ? 'x' : 'minus';
    chip.append(glyph);
    chip.append(document.createTextNode(VALIDATION_LABELS[check.id] ?? '资料检查'));
    checks.append(chip);
  });
  renderIcons();
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
  const total = verificationDraft.length;
  const attention = counts.unverified + counts.needs_review;
  const percentage = total ? Math.round((counts.verified / total) * 100) : 100;
  setText('#verification-attention-count', String(attention));
  setText('#verification-verified-count', String(counts.verified));
  setText('#verification-all-count', String(total));
  setText('#verification-progress-label', `${percentage}% 已确认`);
  element<WebAwesomeProgressBar>('#verification-progress-bar').value = percentage;
  setText(
    '#verification-summary-heading',
    attention ? `还有 ${attention} 项需要确认` : '申请资料已就绪',
  );
  setText(
    '#verification-summary-copy',
    attention
      ? '只处理下方的例外项；已确认内容已收起，不需要重复检查。'
      : '所有资料都已确认，可以安全用于简历和申请材料。',
  );
}

function verificationRow(item: VerificationItem): HTMLElement {
  const row = make('article', 'verification-row');
  row.dataset.factId = item.id;
  row.dataset.status = item.status;
  const needsAttention = item.status !== 'verified';

  const selector = make('label', `verification-selector${needsAttention ? '' : ' hidden'}`);
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selectedVerificationIds.has(item.id);
  const label = verificationItemLabel(item);
  checkbox.setAttribute('aria-label', `选择 ${label}`);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedVerificationIds.add(item.id);
    else selectedVerificationIds.delete(item.id);
    renderVerificationSelection();
  });
  selector.append(checkbox);

  const identity = make('div', 'verification-identity');
  identity.append(
    make('strong', '', label),
    make('span', '', `${verificationCategoryLabel(item.category)} · ${verificationSourceLabel(item.source)}`),
  );

  const state = make('span', `verification-state ${item.status}`);
  state.append(make('i', 'verification-state-dot'));
  state.append(document.createTextNode(VERIFICATION_LABELS[item.status]));

  const actions = make('div', 'verification-row-actions');
  if (needsAttention) {
    const confirm = make('button', 'verification-confirm-button', '我已核对') as HTMLButtonElement;
    confirm.type = 'button';
    confirm.addEventListener('click', () => {
      item.status = 'verified';
      selectedVerificationIds.delete(item.id);
      setProfileDirty(true);
      setText('#verification-save-message', `${label}已核对；保存后才会用于简历和申请材料。`);
      renderVerification();
    });
    actions.append(confirm);
  }
  const detailsButton = make('button', 'verification-details-button', expandedVerificationIds.has(item.id) ? '收起' : '详情') as HTMLButtonElement;
  detailsButton.type = 'button';
  detailsButton.setAttribute('aria-expanded', String(expandedVerificationIds.has(item.id)));
  const detailsId = `verification-details-${item.id.replace(/[^a-z0-9_-]/gi, '-')}`;
  detailsButton.setAttribute('aria-controls', detailsId);
  detailsButton.addEventListener('click', () => {
    if (expandedVerificationIds.has(item.id)) expandedVerificationIds.delete(item.id);
    else expandedVerificationIds.add(item.id);
    renderVerification();
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`.verification-row[data-fact-id="${CSS.escape(item.id)}"] .verification-details-button`)?.focus();
    });
  });
  actions.append(detailsButton);

  const summary = make('div', 'verification-row-summary');
  summary.append(selector, identity, state, actions);

  const details = make('div', `verification-details${expandedVerificationIds.has(item.id) ? '' : ' hidden'}`);
  details.id = detailsId;

  const status = make('select') as HTMLSelectElement;
  status.dataset.verificationField = 'status';
  (Object.keys(VERIFICATION_LABELS) as VerificationStatus[]).forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = VERIFICATION_LABELS[value];
    option.selected = value === item.status;
    status.append(option);
  });
  status.setAttribute('aria-label', `${label} 验证状态`);

  const copy = make('div', 'verification-copy');
  const sourceField = make('div', 'verification-source-field');
  sourceField.append(make('span', '', '原始来源'), make('code', '', item.source || '未记录来源'));
  const statusField = make('label', 'verification-detail-field');
  statusField.append(make('span', '', '使用状态'), status);
  const evidence = make('input') as HTMLInputElement;
  evidence.dataset.verificationField = 'evidence';
  evidence.value = item.evidence;
  evidence.placeholder = '例如：证书、合同或公开项目链接…';
  evidence.maxLength = 1000;
  evidence.setAttribute('aria-label', `${label} 验证证据`);
  const note = make('input') as HTMLInputElement;
  note.dataset.verificationField = 'note';
  note.value = item.note;
  note.placeholder = '补充说明（可选）…';
  note.maxLength = 1000;
  note.setAttribute('aria-label', `${label} 备注`);
  const evidenceField = make('label', 'verification-detail-field');
  evidenceField.append(make('span', '', '证据或依据'), evidence);
  const noteField = make('label', 'verification-detail-field');
  noteField.append(make('span', '', '备注'), note);
  copy.append(sourceField, statusField, evidenceField, noteField);
  details.append(copy);
  row.append(summary, details);
  return row;
}

function renderVerificationSelection(): void {
  const selected = [...selectedVerificationIds]
    .filter((id) => verificationDraft.some((item) => item.id === id && item.status !== 'verified'));
  const actions = element('#verification-bulk-actions');
  actions.classList.toggle('hidden', selected.length === 0);
  setText('#verification-selection-count', `已选择 ${selected.length} 项`);
  element<HTMLButtonElement>('#verification-confirm-selected').disabled = selected.length === 0;
}

function renderVerification(): void {
  const list = element('#verification-list');
  clear(list);
  const visible = verificationDraft.filter((item) => {
    if (verificationFilter === 'attention') return item.status !== 'verified';
    if (verificationFilter === 'verified') return item.status === 'verified';
    return true;
  });
  visible.forEach((item) => list.append(verificationRow(item)));
  element('#verification-empty').classList.toggle('hidden', visible.length > 0);
  renderVerificationCounts();
  renderVerificationSelection();
  renderIcons();
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
      : '资料来源未记录',
  );
  const boundary = element('#migration-boundary');
  boundary.textContent = migration.runtimeDisconnected
    ? '旧资料来源已停用'
    : '资料来源待确认';
  boundary.classList.toggle('warning', !migration.runtimeDisconnected);

  verificationDraft = data.profileWorkspace.verification.map((item) => ({ ...item }));
  selectedVerificationIds.clear();
  renderVerification();
  setProfileDirty(false);
}

function renderCvOutline(markdown: string): void {
  const outline = element('#cv-outline');
  clear(outline);
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());
  headings.forEach((heading, index) => {
    const button = make('button', '', heading);
    button.type = 'button';
    button.addEventListener('click', () => {
      const editorHeadings = element('#cv-visual-editor').querySelectorAll('h2');
      editorHeadings.item(index)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    outline.append(button);
  });
  if (!headings.length) outline.append(make('span', 'muted-copy', '添加章节后会显示在这里'));
}

async function renderCvEditor(markdown: string): Promise<void> {
  const renderId = ++cvEditorRenderId;
  const previous = cvEditor;
  cvEditor = null;
  if (previous) await previous.destroy();
  if (renderId !== cvEditorRenderId) return;

  const root = element('#cv-visual-editor');
  clear(root);
  const loading = element('#cv-editor-loading');
  loading.hidden = false;

  const nextEditor = new Crepe({
    root,
    defaultValue: markdown,
    features: {
      [CrepeFeature.ImageBlock]: false,
      [CrepeFeature.AI]: false,
    },
    featureConfigs: {
      [CrepeFeature.Placeholder]: {
        text: '从这里开始完善你的简历…',
      },
    },
  });
  nextEditor.on((listener) => {
    listener.markdownUpdated((_ctx, nextMarkdown) => {
      if (nextEditor !== cvEditor) return;
      renderCvOutline(nextMarkdown);
      setCvDirty(nextMarkdown !== cvEditorBaseline);
    });
  });

  try {
    await nextEditor.create();
    if (renderId !== cvEditorRenderId) {
      await nextEditor.destroy();
      return;
    }
    cvEditor = nextEditor;
    cvEditorBaseline = nextEditor.getMarkdown();
    root.querySelector('.ProseMirror')?.setAttribute('aria-label', '简历内容');
    loading.hidden = true;
    setCvDirty(false);
  } catch (error) {
    loading.textContent = error instanceof Error ? `编辑器无法载入：${error.message}` : '编辑器无法载入。';
    showNotice('简历编辑器无法载入，原始简历没有被修改。', 'error');
  }
}

function renderCv(data: CareerOpsSnapshot): void {
  setText('#cv-summary', cvSummary(data.cv.content));
  setText(
    '#cv-meta',
    data.cv.exists
      ? `${formatBytes(data.cv.bytes)} · 更新于 ${formatDate(data.cv.modifiedAt)}`
      : '文件不存在',
  );
  renderCvOutline(data.cv.content);
  setCvDirty(false);
  void renderCvEditor(data.cv.content);
}

function makeJobRow(job: PipelineJob, compact = false): HTMLElement {
  const row = make('article', compact ? 'compact-job-row' : 'job-row');
  row.classList.toggle('selected', !compact && job.id === selectedJobId);
  const report = snapshot ? reportForJob(snapshot, job) : null;
  const marker = make('span', 'job-marker', job.company.slice(0, 2).toUpperCase());
  const copy = make('div', 'job-copy');
  copy.append(make('strong', '', job.role), make('span', '', job.company));
  const meta = make('div', 'job-meta');
  if (job.location) meta.append(make('span', '', job.location));
  if (job.postedAt) meta.append(make('span', '', `发布 ${job.postedAt}`));
  meta.append(make('span', '', sourceHost(job.url)));
  const state = make('span', job.done ? 'job-state done' : 'job-state pending', job.done ? '已处理' : '待处理');
  const score = make('span', `score-pill ${report ? scoreTone(report.score) : 'neutral'}`, report?.score ? `${report.score}/5` : '未评分');
  row.append(marker, copy, meta, score, state);
  if (!compact) {
    const open = make('button', 'job-evaluate-button', job.id === selectedJobId ? '已选择' : '查看');
    open.type = 'button';
    open.dataset.selectJobId = job.id;
    open.setAttribute('aria-label', `查看 ${job.company} 的 ${job.role}`);
    row.append(open);
  } else {
    const open = make('button', 'compact-job-open text-button', '打开') as HTMLButtonElement;
    open.type = 'button';
    open.dataset.openRecommendedJobId = job.id;
    open.setAttribute('aria-label', `打开 ${job.company} 的 ${job.role}`);
    row.append(open);
  }
  return row;
}

function jobReportScore(job: PipelineJob): number | null {
  const score = snapshot ? Number.parseFloat(reportForJob(snapshot, job)?.score ?? '') : Number.NaN;
  return Number.isFinite(score) ? score : null;
}

function sortJobsForDisplay(jobs: PipelineJob[]): PipelineJob[] {
  return [...jobs].sort((left, right) => {
    const leftScore = jobReportScore(left);
    const rightScore = jobReportScore(right);
    if (leftScore !== null || rightScore !== null) {
      if (leftScore === null) return 1;
      if (rightScore === null) return -1;
      if (leftScore !== rightScore) return rightScore - leftScore;
    }
    const leftDate = Date.parse(left.postedAt || '') || 0;
    const rightDate = Date.parse(right.postedAt || '') || 0;
    if (leftDate !== rightDate) return rightDate - leftDate;
    return `${left.company} ${left.role}`.localeCompare(`${right.company} ${right.role}`);
  });
}

function recommendedJobs(data: CareerOpsSnapshot): PipelineJob[] {
  return sortJobsForDisplay(data.pipeline.jobs.filter((job) => reportForJob(data, job) !== null));
}

function filteredJobs(): PipelineJob[] {
  if (!snapshot) return [];
  const query = pipelineQuery.trim().toLocaleLowerCase();
  return sortJobsForDisplay(snapshot.pipeline.jobs.filter((job) => {
    const stateMatches = pipelineFilter === 'all'
      || (pipelineFilter === 'processed' ? job.done : !job.done);
    const haystack = `${job.company} ${job.role} ${job.location}`.toLocaleLowerCase();
    return stateMatches && (!query || haystack.includes(query));
  }));
}


function sameJobIdentity(leftCompany: string, leftRole: string, rightCompany: string, rightRole: string): boolean {
  const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  return Boolean(leftCompany && leftRole)
    && normalize(leftCompany) === normalize(rightCompany)
    && normalize(leftRole) === normalize(rightRole);
}

function reportForJob(data: CareerOpsSnapshot, job: PipelineJob): ReportSummary | null {
  return data.reports.find((report) => sameJobIdentity(report.company, report.role, job.company, job.role)) ?? null;
}

function trackerForJob(data: CareerOpsSnapshot, job: PipelineJob, report: ReportSummary | null): TrackerApplication | null {
  const reportName = normalizeReportName(report?.name ?? '');
  return data.tracker.applications.find((application) => {
    const applicationReport = normalizeReportName(application.report);
    if (reportName && applicationReport && applicationReport !== '—' && applicationReport === reportName) return true;
    return sameJobIdentity(application.company, application.role, job.company, job.role);
  }) ?? null;
}

function materialVersionsForJob(job: PipelineJob, report: ReportSummary | null): ApplicationMaterialVersion[] {
  const reportName = normalizeReportName(report?.name ?? '');
  return (materialsWorkspace?.versions ?? []).filter((version) => (
    (reportName && normalizeReportName(version.reportName) === reportName)
    || sameJobIdentity(version.company, version.role, job.company, job.role)
  ));
}

function setWorkbenchStage(stage: 'source' | 'report' | 'materials' | 'application', complete: boolean, current: boolean): void {
  const node = element('[data-workbench-stage="' + stage + '"]');
  node.classList.toggle('complete', complete);
  node.classList.toggle('current', current);
}

function renderJobWorkbench(data: CareerOpsSnapshot): void {
  const visibleJobs = filteredJobs();
  if (!visibleJobs.some((job) => job.id === selectedJobId)) selectedJobId = visibleJobs[0]?.id ?? '';
  const job = data.pipeline.jobs.find((candidate) => candidate.id === selectedJobId) ?? null;
  element('#job-workbench-empty').classList.toggle('hidden', Boolean(job));
  element('#job-workbench-content').classList.toggle('hidden', !job);
  if (!job) return;

  const report = reportForJob(data, job);
  const tracker = trackerForJob(data, job, report);
  const versions = materialVersionsForJob(job, report);
  const status = tracker?.status || '未记录';
  const applied = Boolean(tracker && tracker.status !== 'Evaluated');
  const applicationClosed = Boolean(tracker && ['Hired', 'Rejected', 'Discarded', 'SKIP'].includes(tracker.status));
  currentWorkbenchReportName = report?.name ?? '';
  currentWorkbenchTrackerRow = tracker?.number ?? '';

  setText('#workbench-company', job.company || '未知公司');
  setText('#workbench-role', job.role || '未命名岗位');
  setText('#workbench-meta', [job.location, sourceHost(job.url)].filter(Boolean).join(' · '));
  setText('#workbench-score', report?.score || '—');
  setText('#workbench-score-label', report ? '匹配评分' : '尚未评分');
  setText('#workbench-trust', job.trust || '待确认');
  setText('#workbench-posted', job.postedAt || '未注明');
  setText('#workbench-version-count', versions.length);
  setText('#workbench-tracker-status', status);
  setText('#workbench-report-state', report ? '已完成' : '待评估');
  setText('#workbench-material-state', versions.length ? versions.at(-1)?.versionLabel || versions.length + ' 个版本' : '待准备');
  setText('#workbench-application-state', tracker ? status : '未投递');

  setWorkbenchStage('source', true, false);
  setWorkbenchStage('report', Boolean(report), Boolean(!report));
  setWorkbenchStage('materials', versions.length > 0, Boolean(report && !versions.length));
  setWorkbenchStage('application', applied, Boolean(versions.length && !applied));

  const reportButton = element('#workbench-report-button');
  const materialsButton = element('#workbench-materials-button');
  const trackerButton = element('#workbench-tracker-button');
  reportButton.classList.toggle('hidden', !report);
  materialsButton.classList.toggle('hidden', !versions.length);
  trackerButton.classList.toggle('hidden', !tracker);

  if (!report) {
    currentWorkbenchAction = 'evaluate';
    setText('#workbench-next-copy', '先验证岗位是否仍开放，再根据你的真实资料完成 A–G 评分。');
    setText('#workbench-primary-action', '评估这个岗位');
  } else if (!versions.length) {
    currentWorkbenchAction = 'prepare-materials';
    setText('#workbench-next-copy', '评分和证据已经就绪；确认申请意图后生成定制材料。');
    setText('#workbench-primary-action', '准备申请材料');
  } else if (tracker?.status === 'Evaluated') {
    currentWorkbenchAction = 'mark-applied';
    setText('#workbench-next-copy', '申请材料已经准备好。完成外部投递后，再在这里记录申请。');
    setText('#workbench-primary-action', '已投递，记录申请');
  } else if (tracker) {
    currentWorkbenchAction = 'view-tracker';
    setText(
      '#workbench-next-copy',
      applicationClosed
        ? '这条申请已经归档；可查看最终结果和历史记录。'
        : '申请已经进入跟进流程；查看回复、面试安排或更新结果。',
    );
    setText('#workbench-primary-action', applicationClosed ? '查看申请结果' : '继续推进申请');
  } else {
    currentWorkbenchAction = 'view-materials';
    setText('#workbench-next-copy', '材料已经生成；检查最终文件后完成投递。');
    setText('#workbench-primary-action', '查看申请材料');
  }
}

async function selectPipelineJob(jobId: string): Promise<void> {
  selectedJobId = jobId;
  if (!snapshot) return;
  renderPipeline(snapshot);
  const job = snapshot.pipeline.jobs.find((candidate) => candidate.id === jobId);
  if (job && reportForJob(snapshot, job) && !materialsWorkspace) await loadMaterialsWorkspace(false);
  if (snapshot) renderJobWorkbench(snapshot);
  window.requestAnimationFrame(() => element('#job-workbench').scrollIntoView({ block: 'nearest' }));
}

function openSelectedTracker(): void {
  if (!currentWorkbenchTrackerRow) return;
  activateRoute('applications-tracker');
  element<HTMLSelectElement>('#tracker-status-row').value = currentWorkbenchTrackerRow;
  element<HTMLSelectElement>('#outcome-row').value = currentWorkbenchTrackerRow;
  window.requestAnimationFrame(() => element('#tracker-status-form').scrollIntoView({ block: 'center' }));
}

async function markSelectedJobApplied(): Promise<void> {
  if (!currentWorkbenchTrackerRow) return;
  if (!await confirmAction('确认已经完成外部投递，并把这条申请更新为 Applied？', {
    title: '记录已投递', action: '记录申请',
  })) return;
  try {
    const result = await window.careerOps.updateTrackerStatus({ rowNumber: currentWorkbenchTrackerRow, status: 'Applied' });
    renderSnapshot(result.snapshot);
    showNotice(result.message || '申请已记录。');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '无法记录申请状态。', 'error');
  }
}

function renderPipeline(data: CareerOpsSnapshot): void {
  setText('#nav-pipeline-count', data.pipeline.pending);
  setText('#pending-count', data.pipeline.pending);
  setText('#processed-count', data.pipeline.processed);
  setText('#pipeline-total-count', data.pipeline.total);
  const list = element('#pipeline-jobs');
  clear(list);
  const jobs = filteredJobs();
  if (!jobs.some((job) => job.id === selectedJobId)) selectedJobId = jobs[0]?.id ?? '';
  jobs.forEach((job) => list.append(makeJobRow(job)));
  if (!jobs.length) {
    const empty = make('div', 'empty-state inline');
    empty.append(make('span', '', '◇'), make('h3', '', '没有符合条件的岗位'), make('p', '', '更换筛选条件，或前往“发现”获取新的岗位。'));
    list.append(empty);
  }

  const overview = element('#overview-jobs');
  clear(overview);
  const recommendations = recommendedJobs(data);
  const overviewJobs = recommendations.length
    ? recommendations.slice(0, 6)
    : sortJobsForDisplay(data.pipeline.jobs.filter((job) => !job.done)).slice(0, 6);
  overviewJobs.forEach((job) => overview.append(makeJobRow(job, true)));
  if (!overview.children.length) {
    overview.append(make('p', 'empty-copy', '当前没有可推荐岗位。'));
  }
  renderJobWorkbench(data);
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
  remove.title = '删除职位来源';
  remove.setAttribute('aria-label', `删除 ${entry.name || '职位来源'}`);
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
  select.replaceChildren(new Option('全部已启用来源', ''));
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
    const action = make('td', 'ats-job-action');
    const evaluate = make('button', 'job-evaluate-button', job.processed ? '重新评估' : '评估');
    evaluate.type = 'button';
    evaluate.dataset.evaluateUrl = job.url;
    evaluate.setAttribute('aria-label', `评估 ${job.company} 的 ${job.role}`);
    action.append(evaluate);
    row.append(action);
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
  if (snapshot) renderJobsWorkflow(snapshot);
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
    showNotice(schedule.enabled ? '每日自动运行已启用。' : '每日自动运行已停用。');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '每日自动化保存失败。', 'error');
  } finally {
    button.disabled = false;
  }
}

function normalizeReportName(value: string): string {
  return value.trim().split(/[\\/]/).at(-1)?.replace(/\.md$/i, '') ?? '';
}

function reportForApplication(application: TrackerApplication): ReportSummary | null {
  const reports = materialsWorkspace?.reports ?? snapshot?.reports ?? [];
  const reportReference = normalizeReportName(application.report);
  return reports.find((report) => {
    const reportName = normalizeReportName(report.name);
    if (reportReference && reportReference !== '—' && reportName === reportReference) return true;
    return Boolean(
      application.company
      && application.role
      && report.company.toLowerCase() === application.company.toLowerCase()
      && report.role.toLowerCase() === application.role.toLowerCase()
    );
  }) ?? null;
}

async function openMaterialsForReport(reportName: string): Promise<void> {
  if (!materialsWorkspace) await loadMaterialsWorkspace();
  const report = materialsWorkspace?.reports.find((candidate) => candidate.name === reportName);
  if (!report) {
    showNotice('没有找到对应的岗位报告，无法准备申请材料。', 'error');
    return;
  }
  activateRoute('applications-materials');
  const select = element<HTMLSelectElement>('#material-report');
  select.value = report.name;
  updateMaterialReportSummary();
  window.requestAnimationFrame(() => element('#material-generator-form').scrollIntoView({ block: 'start' }));
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
    summary.append(make('strong', '', '尚未选择岗位'), make('span', '', '先完成岗位评估，再生成申请材料。'));
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
  if (snapshot) {
    renderApplicationsWorkflow(snapshot);
    renderJobWorkbench(snapshot);
  }
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
    showNotice(`申请材料 ${result.version.versionLabel} 已安全保存。`);
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
  const actionCell = make('td', 'tracker-action-cell');
  const report = reportForApplication(application);
  const materialButton = make('button', 'text-button', report ? '申请材料' : '先评估') as HTMLButtonElement;
  materialButton.type = 'button';
  materialButton.disabled = !report;
  if (report) materialButton.dataset.prepareReport = report.name;
  actionCell.append(materialButton);
  row.append(actionCell);
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
  if (typeof value === 'string') {
    element(selector).textContent = value;
    return;
  }
  const labels: Record<string, string> = {
    metadata: '摘要',
    analysisDate: '分析日期',
    totalTracked: '申请总数',
    actionable: '建议跟进',
    overdue: '已逾期',
    urgent: '优先处理',
    cold: '暂缓跟进',
    waiting: '等待回复',
    company: '公司',
    role: '岗位',
    status: '状态',
    nextFollowup: '建议日期',
    daysSinceApplication: '申请后天数',
  };
  const output: string[] = [];
  const append = (key: string, item: unknown, depth = 0): void => {
    const label = labels[key] ?? key.replace(/_/g, ' ');
    const indent = '  '.repeat(depth);
    if (Array.isArray(item)) {
      output.push(`${indent}${label}：${item.length}`);
      item.forEach((entry, index) => append(`第 ${index + 1} 项`, entry, depth + 1));
    } else if (item && typeof item === 'object') {
      output.push(`${indent}${label}`);
      Object.entries(item as Record<string, unknown>).forEach(([childKey, child]) => append(childKey, child, depth + 1));
    } else {
      output.push(`${indent}${label}：${item === null || item === '' ? '未记录' : String(item)}`);
    }
  };
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => append(key, item));
  } else {
    output.push('暂无跟进建议。');
  }
  element(selector).textContent = output.join('\n');
}

async function refreshFollowupCadence(): Promise<void> {
  const output = element('#followup-output');
  output.textContent = '正在计算下一次跟进建议…';
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
  if (!rowNumber) return showNotice('请先选择一条申请记录。', 'error');
  if (!await confirmAction(`确认将 #${rowNumber} 更新为 ${status}？这项变更会保存到申请记录。`, {
    title: '更新申请状态', action: '确认更新',
  })) return;
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
  if (!rowNumber) return showNotice('请先选择一条申请记录。', 'error');
  if (!await confirmAction(`确认为 #${rowNumber} 建立跟进提醒？`, {
    title: '建立跟进提醒', action: '建立提醒',
  })) return;
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
  resultElement.textContent = '正在识别回复对应的申请…';
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
        ? '这只是建议；点击“确认应用建议状态”后才会修改申请记录。'
        : '没有足够明确的匹配或建议状态，申请记录不会被修改。',
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
  if (!await confirmAction(`确认将 #${recommendation.match.applicationNumber} 更新为 ${status}？此操作不会发送邮件。`, {
    title: '应用回复建议', action: '更新状态',
  })) return;
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
  resultElement.textContent = '正在匹配面试邀请对应的申请…';
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
  if (!rowNumber) return showNotice('请先选择一条申请记录。', 'error');
  if (!await confirmAction(`确认记录 #${rowNumber} 的“${outcomeType}”结果？申请状态会同步更新。`, {
    title: '归档申请结果', action: '确认归档', tone: 'danger',
  })) return;
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
    empty.append(make('span', '', '≡'), make('h3', '', '还没有评估报告'), make('p', '', '评估一个岗位后，完整报告会显示在这里。'));
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
  if (snapshot) {
    renderGuidedSetup(snapshot);
    renderTodayFocus(snapshot);
  }
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
  if (!await confirmAction(`确定删除“${service?.name ?? '当前服务'}”及其本机加密 Key 吗？`, {
    title: '删除模型服务', action: '删除服务', tone: 'danger',
  })) return;
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
  setText('#job-tracker-status', evaluation.trackerStatus === 'merged' ? '申请记录已登记' : '申请记录待登记');
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
  if (snapshot) {
    renderProfileReadiness(snapshot);
    renderTodayFocus(snapshot);
  }
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
  renderProfileReadiness(data);
  renderGuidedSetup(data);
  renderJobsWorkflow(data);
  renderApplicationsWorkflow(data);
  renderTodayFocus(data);
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
    if (item.status === 'verified') selectedVerificationIds.delete(item.id);
    renderVerification();
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
  verificationFilter = 'attention';
  document.querySelectorAll<HTMLButtonElement>('[data-verification-filter]').forEach((button) => {
    const active = button.dataset.verificationFilter === verificationFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderVerification();
}

function ensureNoUnsavedChanges(): boolean {
  if (!profileDirty && !cvDirty && !portalDirty) return true;
  showNotice('存在未保存修改。请先保存个人资料、简历或职位来源，再重新读取或切换资料库。', 'error');
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
    showNotice('职位来源已保存，并已创建备份。');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '职位来源保存失败。', 'error');
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
    showNotice('职位来源有未保存修改，请先保存再运行扫描。', 'error');
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
  element('#start-scan-button').textContent = mode === 'quick' ? '开始常规扫描' : '开始全量扫描';
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
  if (!snapshot || !cvDirty || !cvEditor) return;
  const button = element<HTMLButtonElement>('#save-cv-button');
  button.disabled = true;
  try {
    const result: SaveResult = await window.careerOps.saveCv({
      expectedRevision: snapshot.cv.revision,
      content: cvEditor.getMarkdown(),
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
    showNotice(error instanceof Error ? error.message : '无法读取求职资料库。', 'error');
  } finally {
    element<HTMLButtonElement>('#refresh-button').disabled = false;
  }
}

async function chooseDirectory(): Promise<void> {
  if (!ensureNoUnsavedChanges()) return;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-connect-workspace]')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const result = await window.careerOps.selectDirectory();
    if (!result.cancelled && result.snapshot) {
      atsWorkspace = null;
      portalDraft = [];
      materialsWorkspace = null;
      activeMaterialVersion = null;
      renderSnapshot(result.snapshot);
      setPortalDirty(false);
      await loadAnalysis();
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '无法选择文件夹。', 'error');
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
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
    const prepareButton = element<HTMLButtonElement>('#prepare-report-application-button');
    prepareButton.dataset.prepareReport = name;
    prepareButton.classList.remove('hidden');
    documentNode.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } catch (error) {
    documentNode.textContent = '';
    element('#prepare-report-application-button').classList.add('hidden');
    documentNode.classList.add('hidden');
    placeholder.classList.remove('hidden');
    showNotice(error instanceof Error ? error.message : '无法读取报告。', 'error');
  }
}

function bindEvents(): void {
  element('#confirmation-cancel').addEventListener('click', () => resolveConfirmation(false));
  element('#confirmation-action').addEventListener('click', () => resolveConfirmation(true));
  element('#confirmation-dialog').addEventListener('wa-after-hide', () => {
    if (confirmationResolver) resolveConfirmation(false);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      const section = button.dataset.section as NavigationSection;
      activateRoute(DEFAULT_ROUTE[section]);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-view]').forEach((button) => {
    button.addEventListener('click', () => navigateToView(button.dataset.openView as ViewName));
  });
  element('#jobs-next-step-button').addEventListener('click', () => activateRoute(currentJobsNextRoute));
  element('#pipeline-jobs').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-select-job-id]');
    if (button?.dataset.selectJobId) void selectPipelineJob(button.dataset.selectJobId);
  });
  element('#overview-jobs').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-open-recommended-job-id]');
    if (!button?.dataset.openRecommendedJobId) return;
    activateRoute('jobs-inbox');
    void selectPipelineJob(button.dataset.openRecommendedJobId);
  });
  element('#workbench-primary-action').addEventListener('click', () => {
    const job = snapshot?.pipeline.jobs.find((candidate) => candidate.id === selectedJobId);
    if (!job) return;
    if (currentWorkbenchAction === 'evaluate') prepareJobEvaluation(job.url);
    else if (currentWorkbenchAction === 'prepare-materials' && currentWorkbenchReportName) void openMaterialsForReport(currentWorkbenchReportName);
    else if (currentWorkbenchAction === 'mark-applied') void markSelectedJobApplied();
    else if (currentWorkbenchAction === 'view-tracker') openSelectedTracker();
    else if (currentWorkbenchAction === 'view-materials' && currentWorkbenchReportName) void openMaterialsForReport(currentWorkbenchReportName);
  });
  element('#workbench-report-button').addEventListener('click', () => {
    if (!currentWorkbenchReportName) return;
    activateRoute('jobs-reports');
    void showReport(currentWorkbenchReportName);
  });
  element('#workbench-materials-button').addEventListener('click', () => {
    if (currentWorkbenchReportName) void openMaterialsForReport(currentWorkbenchReportName);
  });
  element('#workbench-tracker-button').addEventListener('click', openSelectedTracker);
  element('#ats-job-body').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-evaluate-url]');
    if (button?.dataset.evaluateUrl) prepareJobEvaluation(button.dataset.evaluateUrl);
  });
  element('#profile-next-step-button').addEventListener('click', () => {
    activateRoute(currentProfileNextRoute);
    if (currentProfileNextTarget === 'verification') {
      window.requestAnimationFrame(() => element('#verification-workspace').scrollIntoView({ block: 'start' }));
    }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-connect-workspace]').forEach((button) => {
    button.addEventListener('click', () => void chooseDirectory());
  });
  element('#dismiss-guided-setup').addEventListener('click', () => {
    guidedSetupDismissed = true;
    element('#guided-setup').hidden = true;
  });
  element('#guided-next-button').addEventListener('click', () => {
    if (currentGuidedAction === 'connect') {
      void chooseDirectory();
      return;
    }
    activateRoute(currentGuidedAction);
    if (currentGuidedVerificationTarget) {
      window.requestAnimationFrame(() => element('#verification-workspace').scrollIntoView({ block: 'start' }));
    }
  });
  element('#guided-automation-button').addEventListener('click', () => activateRoute('settings-automation'));
  element('#today-next-step-button').addEventListener('click', () => {
    if (currentTodayChoosesFolder) void chooseDirectory();
    else activateRoute(currentTodayNextRoute);
  });
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
    void confirmAction('确定要清除已加密保存的 API Key 吗？', {
      title: '清除 API Key', action: '清除 Key', tone: 'danger',
    }).then((confirmed) => {
      if (confirmed) void saveModelSettings(true);
    });
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
    navigateToView('reports');
    void showReport(currentJobEvaluation.reportName);
  });
  element('#prepare-application-button').addEventListener('click', () => {
    if (currentJobEvaluation) void openMaterialsForReport(currentJobEvaluation.reportName);
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
  document.querySelectorAll<HTMLButtonElement>('[data-verification-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      verificationFilter = button.dataset.verificationFilter as VerificationFilter;
      selectedVerificationIds.clear();
      document.querySelectorAll<HTMLButtonElement>('[data-verification-filter]').forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-pressed', String(active));
      });
      renderVerification();
    });
  });
  element('#verification-clear-selection').addEventListener('click', () => {
    selectedVerificationIds.clear();
    renderVerification();
  });
  element('#verification-confirm-selected').addEventListener('click', () => {
    void (async () => {
      const selected = verificationDraft.filter((item) => selectedVerificationIds.has(item.id) && item.status !== 'verified');
      if (!selected.length) return;
      const confirmed = await confirmAction(
        `确认这 ${selected.length} 项资料准确，并允许用于简历和申请材料？`,
        { title: '确认所选资料', action: `确认 ${selected.length} 项` },
      );
      if (!confirmed) return;
      selected.forEach((item) => { item.status = 'verified'; });
      selectedVerificationIds.clear();
      setProfileDirty(true);
      setText('#verification-save-message', `${selected.length} 项资料已核对；保存后才会用于简历和申请材料。`);
      renderVerification();
    })();
  });
  element('#verification-save-button').addEventListener('click', () => void saveProfileChanges());
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
  element('#applications-next-step-button').addEventListener('click', () => activateRoute(currentApplicationsNextRoute));
  element('#tracker-body').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-prepare-report]');
    if (button?.dataset.prepareReport) void openMaterialsForReport(button.dataset.prepareReport);
  });
  element('#prepare-report-application-button').addEventListener('click', (event) => {
    const reportName = (event.currentTarget as HTMLButtonElement).dataset.prepareReport;
    if (reportName) void openMaterialsForReport(reportName);
  });
  element('#report-list').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-report]');
    if (button?.dataset.report) void showReport(button.dataset.report);
  });
}

bindEvents();
renderIcons();
activateRoute('today');
void loadAiSettings();
void window.careerOps.getScanStatus().then(renderScanStatus);
void loadSnapshot(true);
