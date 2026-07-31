export type ValidationCheck = {
  id: string;
  label: string;
  relativePath: string;
  required: boolean;
  present: boolean;
};

export type CareerOpsValidation = {
  root: string;
  valid: boolean;
  checks: ValidationCheck[];
  warnings: string[];
};

export type LocalDocument = {
  relativePath: string;
  exists: boolean;
  content: string;
  bytes: number;
  modifiedAt: string | null;
  revision: string;
};

export type ProfileSummary = {
  fullName: string;
  location: string;
  headline: string;
  targetRoles: string[];
  outputLanguage: string;
  spendTier: string;
};

export type VerificationStatus = 'verified' | 'unverified' | 'needs_review';

export type VerificationItem = {
  id: string;
  label: string;
  category: string;
  source: string;
  status: VerificationStatus;
  evidence: string;
  note: string;
};

export type MigrationSummary = {
  state: string;
  sourceLabel: string;
  sourceUpdatedAt: string;
  migratedAt: string;
  runtimeDisconnected: boolean;
};

export type ProfileEditor = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  targetRoles: string[];
  country: string;
  city: string;
  timezone: string;
  compensationTargetRange: string;
  compensationCurrency: string;
  compensationMinimum: string;
  locationFlexibility: string;
  preferredRegions: string[];
  workArrangements: string[];
  employmentTypes: string[];
  maxPostingAgeDays: number;
  otherRequirements: string[];
  automaticSubmission: boolean;
};

export type ProfileWorkspace = {
  editor: ProfileEditor;
  verification: VerificationItem[];
  migration: MigrationSummary;
};

export type PipelineJob = {
  id: string;
  done: boolean;
  url: string;
  company: string;
  role: string;
  location: string;
  compensation: string;
  postedAt: string;
  trust: string;
};

export type PipelineSnapshot = {
  total: number;
  pending: number;
  processed: number;
  jobs: PipelineJob[];
};

export type TrackerApplication = {
  number: string;
  date: string;
  company: string;
  via: string;
  role: string;
  score: string;
  status: string;
  pdf: string;
  report: string;
  notes: string;
};

export type TrackerSnapshot = {
  total: number;
  byStatus: Record<string, number>;
  applications: TrackerApplication[];
};

export type TrackerStatus =
  | 'Evaluated'
  | 'Applied'
  | 'Responded'
  | 'Interview'
  | 'Offer'
  | 'Hired'
  | 'Rejected'
  | 'Discarded'
  | 'SKIP';

export type TrackerStatusChangeRequest = {
  rowNumber: string;
  status: TrackerStatus;
  note?: string;
  occurredOn?: string;
};

export type TrackerMutationResult = {
  ok: boolean;
  message: string;
  snapshot: CareerOpsSnapshot;
  detail?: Record<string, unknown>;
};

export type ReplyDraft = {
  from: string;
  subject: string;
  body: string;
};

export type ReplyRecommendation = {
  candidate: {
    messageId: string;
    from: string;
    subject: string;
    body: string;
  };
  classification: {
    type: string;
    evidence: string[];
    suggestedTrackerUpdate: string;
  };
  match: {
    applicationNumber: string | null;
    companyHint: string;
    roleHint: string;
    confidence: string;
    signals: string[];
  };
  canApplySuggestedStatus: boolean;
};

export type InviteMatchResult = {
  signals: {
    company: string | null;
    date: string | null;
    reqId: string | null;
    platform: string | null;
  };
  candidates: Array<{
    appNumber: number;
    company: string;
    role: string;
    status: string;
    confidence?: string;
    [key: string]: unknown;
  }>;
};

export type FollowupCadenceResult = {
  [key: string]: unknown;
};

export type OutcomeRequest = {
  rowNumber: string;
  outcomeType: 'interview_progress' | 'offer_received' | 'hired' | 'offer_declined' | 'rejected' | 'no_response' | 'interview_only';
  stage?: string;
  feedback?: string;
  note?: string;
  url?: string;
};

export type ReportSummary = {
  name: string;
  title: string;
  company: string;
  role: string;
  score: string;
  modifiedAt: string;
  bytes: number;
};

export type CareerOpsSnapshot = {
  loadedAt: string;
  validation: CareerOpsValidation;
  cv: LocalDocument;
  profile: LocalDocument;
  profileSummary: ProfileSummary;
  profileWorkspace: ProfileWorkspace;
  pipeline: PipelineSnapshot;
  tracker: TrackerSnapshot;
  reports: ReportSummary[];
};

export type DirectorySelectionResult = {
  cancelled: boolean;
  snapshot: CareerOpsSnapshot | null;
};

export type ReportDocument = {
  name: string;
  content: string;
  bytes: number;
  modifiedAt: string;
};

export type SaveProfileRequest = {
  expectedRevision: string;
  profile: ProfileEditor;
  verification: VerificationItem[];
};

export type SaveCvRequest = {
  expectedRevision: string;
  content: string;
};

export type SaveSuccess = {
  ok: true;
  snapshot: CareerOpsSnapshot;
  backupDirectory: string;
};

export type SaveFailure = {
  ok: false;
  kind: 'conflict' | 'validation' | 'io';
  message: string;
};

export type SaveResult = SaveSuccess | SaveFailure;

export type ScoreDimension = {
  id: string;
  label: string;
  score: number;
  maximum: number;
  summary: string;
  evidence: string[];
};

export type MarketCount = {
  label: string;
  count: number;
};

export type MarketSnapshot = {
  sampleSize: number;
  targetRoleMatches: number;
  swissMatches: number;
  preferredRegionMatches: number;
  remoteMatches: number;
  recentMatches: number;
  latestPostedAt: string;
  topLocations: MarketCount[];
  topCompanies: MarketCount[];
  seniority: MarketCount[];
  sourceCoverage: MarketCount[];
  limitation: string;
};

export type AdviceSurface = 'CV' | 'LinkedIn' | 'GitHub' | 'Portfolio';
export type AdvicePriority = 'high' | 'medium' | 'low';

export type CompetitivenessAdvice = {
  id: string;
  surface: AdviceSurface;
  priority: AdvicePriority;
  title: string;
  detail: string;
  evidence: string[];
};

export type PositioningStrength = {
  text: string;
  evidence: string;
};

export type PositioningProposal = {
  headline: string;
  statement: string;
  strengths: PositioningStrength[];
};

export type AnalysisProvider = {
  mode: 'evidence' | 'ai';
  label: string;
  available: boolean;
  detail: string;
};

export type CompetitivenessAnalysis = {
  id: string;
  generatedAt: string;
  inputRevision: {
    cv: string;
    profile: string;
    pipeline: string;
  };
  score: number;
  scoreLabel: string;
  scoreDisclaimer: string;
  dimensions: ScoreDimension[];
  market: MarketSnapshot;
  advice: CompetitivenessAdvice[];
  positioning: PositioningProposal;
  provider: AnalysisProvider;
  limitations: string[];
};

export type ConfirmPositioningRequest = {
  analysisId: string;
  expectedRevision: string;
};

export type AiProviderKind = 'openai-compatible' | 'anthropic';

export type AiServiceSettings = {
  id: string;
  name: string;
  provider: AiProviderKind;
  baseUrl: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutSeconds: number;
  supportsVision: boolean;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  keyConfigured: boolean;
  keyHint: string;
};

export type AiSettings = AiServiceSettings & {
  activeServiceId: string;
  services: AiServiceSettings[];
  encryptionAvailable: boolean;
};

export type SaveAiSettingsRequest = {
  serviceId?: string;
  name?: string;
  provider: AiProviderKind;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutSeconds?: number;
  supportsVision?: boolean;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  apiKey?: string;
  clearKey?: boolean;
};

export type AiServicePreset = 'openai' | 'deepseek' | 'anthropic' | 'openrouter' | 'ollama' | 'lm-studio' | 'custom';

export type AiModelsRequest = {
  serviceId: string;
  provider: AiProviderKind;
  baseUrl: string;
  apiKey?: string;
};

export type AiModelsResult = {
  models: string[];
  endpoint: string;
};

export type AiConnectionTestResult = {
  ok: boolean;
  message: string;
  latencyMs: number;
  modelCount: number;
};

export type JobInputKind = 'url' | 'jd';
export type JobLivenessStatus = 'active' | 'expired' | 'uncertain' | 'not_applicable';

export type JobEvaluationRequest = {
  inputKind: JobInputKind;
  input: string;
};

export type JobLiveness = {
  status: JobLivenessStatus;
  code: string;
  reason: string;
  engine: string;
  requestedUrl: string;
  finalUrl: string;
  extractedCharacters: number;
};

export type EvaluationEvidence = {
  source: string;
  quote: string;
};

export type EvaluationBlockId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export type EvaluationBlock = {
  id: EvaluationBlockId;
  title: string;
  score: number | null;
  summary: string;
  details: string[];
  evidence: EvaluationEvidence[];
  risks: string[];
};

export type LegitimacyTier = 'High Confidence' | 'Proceed with Caution' | 'Suspicious';

export type LegitimacySignal = {
  name: string;
  finding: string;
  weight: 'Positive' | 'Neutral' | 'Concerning';
  evidence: string;
};

export type EvaluationUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  pricingSource: 'user-configured' | 'not-configured';
};

export type JobEvaluation = {
  id: string;
  generatedAt: string;
  company: string;
  role: string;
  location: string;
  archetype: string;
  score: number;
  finalDecision: 'Apply' | 'Consider' | 'Research first' | 'Skip';
  confidence: 'Low' | 'Medium' | 'High';
  advertisedComp: string | null;
  workAuth: 'sponsors' | 'not_needed' | 'unstated' | 'no_sponsorship';
  legitimacyTier: LegitimacyTier;
  liveness: JobLiveness;
  blocks: EvaluationBlock[];
  legitimacySignals: LegitimacySignal[];
  riskSummary: Record<string, string>;
  keywords: string[];
  model: {
    provider: AiProviderKind;
    name: string;
    endpoint: string;
  };
  usage: EvaluationUsage;
  evidenceCount: number;
  errors: string[];
  reportName: string;
  reportRelativePath: string;
  trackerStatus: 'merged' | 'pending' | 'failed';
};

export type JobEvaluationError = {
  stage: 'input' | 'liveness' | 'extraction' | 'settings' | 'model' | 'validation' | 'report';
  code: string;
  message: string;
  detail: string;
};

export type JobEvaluationRunResult =
  | { ok: true; evaluation: JobEvaluation; snapshot: CareerOpsSnapshot }
  | { ok: false; error: JobEvaluationError };

export type PortalKind = 'company' | 'board';

export type PortalEntry = {
  id: string;
  kind: PortalKind;
  name: string;
  provider: string;
  careersUrl: string;
  api: string;
  scanMethod: string;
  enabled: boolean;
  notes: string;
};

export type PortalFilters = {
  titlePositive: string[];
  titleNegative: string[];
  locationAlwaysAllow: string[];
  locationAllow: string[];
  locationBlock: string[];
  maxPostingAgeDays: number | null;
  trustEnabled: boolean;
};

export type PortalConfigSnapshot = {
  revision: string;
  modifiedAt: string | null;
  bytes: number;
  entries: PortalEntry[];
  filters: PortalFilters;
  providerCounts: Array<{ provider: string; total: number; enabled: number }>;
};

export type SavePortalsRequest = {
  expectedRevision: string;
  entries: PortalEntry[];
  filters: PortalFilters;
};

export type PortalSaveResult =
  | { ok: true; portals: PortalConfigSnapshot; backupDirectory: string }
  | SaveFailure;

export type JobFreshness = 'today' | 'fresh' | 'aging' | 'old' | 'unknown';
export type JobHealth = 'reachable' | 'empty' | 'slug_gone' | 'network' | 'auth' | 'server' | 'unknown' | 'not_checked';
export type JobLivenessState = 'active' | 'expired' | 'blocked' | 'invalid' | 'not_checked';
export type JobDuplicateState = 'unique' | 'repost' | 'cross_listing';

export type AtsJob = {
  id: string;
  url: string;
  company: string;
  role: string;
  location: string;
  provider: string;
  firstSeen: string;
  postedAt: string;
  freshness: JobFreshness;
  ageDays: number | null;
  scanStatus: string;
  liveness: JobLivenessState;
  health: JobHealth;
  trustScore: number | null;
  trustFlags: string[];
  duplicateState: JobDuplicateState;
  repostCount: number;
  inPipeline: boolean;
  processed: boolean;
};

export type ScanRunSummary = {
  timestamp: string;
  status: string;
  companies: number;
  boards: number;
  found: number;
  filtered: number;
  duplicates: number;
  added: number;
  errors: number;
};

export type AtsWorkspace = {
  loadedAt: string;
  portals: PortalConfigSnapshot;
  jobs: AtsJob[];
  runs: ScanRunSummary[];
  totals: {
    jobs: number;
    activePipeline: number;
    fresh: number;
    trustFlagged: number;
    reposts: number;
    unhealthyPortals: number;
  };
};

export type QuickScanRequest = {
  kind: 'quick';
  dryRun: boolean;
  verify: boolean;
  company: string;
  postedAfter: string;
  postedBefore: string;
};

export type FullScanRequest = {
  kind: 'full';
  dryRun: boolean;
  liveness: boolean;
  sinceDays: number;
  limit: number | null;
  ats: Array<'greenhouse' | 'lever' | 'ashby' | 'workday' | 'icims'>;
  resume: boolean;
  includeUndated: boolean;
};

export type ScanRequest = QuickScanRequest | FullScanRequest;
export type ScanState = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ScanRunStatus = {
  id: string;
  kind: ScanRequest['kind'] | null;
  state: ScanState;
  startedAt: string | null;
  endedAt: string | null;
  exitCode: number | null;
  commandLabel: string;
  logs: string[];
  error: string;
  result: Record<string, unknown> | null;
};

export type BatchJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'rate_limited' | 'paused_rate_limit';

export type BatchJob = {
  id: number;
  url: string;
  company: string;
  role: string;
  status: BatchJobStatus;
  startedAt: string;
  completedAt: string;
  reportNumber: string;
  score: number | null;
  error: string;
  retries: number;
};

export type BatchRunState = 'idle' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';

export type BatchOptions = {
  concurrency: number;
  maxRetries: number;
  retryDelaySeconds: number;
  limit: number;
  notifyScore: number;
  retryFailed: boolean;
  resumeIncomplete: boolean;
};

export type HighScoreMatch = {
  company: string;
  role: string;
  score: number;
  reportName: string;
};

export type BatchRunStatus = {
  id: string;
  state: BatchRunState;
  startedAt: string | null;
  endedAt: string | null;
  active: number;
  queued: number;
  completed: number;
  failed: number;
  total: number;
  options: BatchOptions | null;
  logs: string[];
  error: string;
  highMatches: HighScoreMatch[];
};

export type DailyAutomationConfig = {
  revision: string;
  enabled: boolean;
  hour: number;
  minute: number;
  options: BatchOptions;
  installed: boolean;
  label: string;
  plistPath: string;
  stdoutPath: string;
  stderrPath: string;
  nextRunAt: string | null;
  updatedAt: string | null;
};

export type SaveDailyAutomationRequest = {
  expectedRevision: string;
  enabled: boolean;
  hour: number;
  minute: number;
  options: BatchOptions;
};

export type AutomationWorkspace = {
  loadedAt: string;
  pendingPipeline: number;
  jobs: BatchJob[];
  run: BatchRunStatus;
  schedule: DailyAutomationConfig;
  recentLog: string[];
};

export type ApplicationMaterialTone = 'formal' | 'direct' | 'conversational' | 'mirror-jd';

export type GenerateApplicationMaterialsRequest = {
  reportName: string;
  motivation: string;
  companyContext: string;
  firstMove: string;
  tone: ApplicationMaterialTone;
  hiringManager: string;
  versionNote: string;
  pageFormat: 'auto' | 'a4' | 'letter';
  overrideLowScore: boolean;
};

export type MaterialArtifact = {
  kind: 'cv-html' | 'cv-pdf' | 'cv-latex' | 'cv-latex-pdf' | 'cover-letter' | 'email' | 'linkedin' | 'manifest';
  label: string;
  relativePath: string;
  bytes: number;
  available: boolean;
};

export type ApplicationMaterialVersion = {
  packageId: string;
  version: number;
  versionLabel: string;
  createdAt: string;
  reportName: string;
  reportNumber: string;
  company: string;
  role: string;
  score: number | null;
  note: string;
  model: string;
  costUsd: number | null;
  artifacts: MaterialArtifact[];
  warnings: string[];
  preview: {
    coverLetter: string;
    emailSubject: string;
    emailBody: string;
    linkedinHeadline: string;
    linkedinAbout: string;
    linkedinOutreach: string;
  };
};

export type ApplicationMaterialsWorkspace = {
  loadedAt: string;
  reports: ReportSummary[];
  versions: ApplicationMaterialVersion[];
  latexCompilerAvailable: boolean;
};

export type MaterialComparison = {
  packageId: string;
  fromVersion: number;
  toVersion: number;
  changes: Array<{ artifact: string; added: string[]; removed: string[] }>;
};

export type GenerateApplicationMaterialsResult =
  | { ok: true; version: ApplicationMaterialVersion; workspace: ApplicationMaterialsWorkspace }
  | { ok: false; stage: 'input' | 'settings' | 'model' | 'validation' | 'render'; message: string; detail: string };

export type CareerOpsDesktopApi = {
  getSnapshot: () => Promise<CareerOpsSnapshot>;
  selectDirectory: () => Promise<DirectorySelectionResult>;
  readReport: (name: string) => Promise<ReportDocument>;
  saveProfile: (request: SaveProfileRequest) => Promise<SaveResult>;
  saveCv: (request: SaveCvRequest) => Promise<SaveResult>;
  getCompetitivenessAnalysis: () => Promise<CompetitivenessAnalysis>;
  runAiCompetitivenessAnalysis: () => Promise<CompetitivenessAnalysis>;
  confirmPositioning: (request: ConfirmPositioningRequest) => Promise<SaveResult>;
  getAiSettings: () => Promise<AiSettings>;
  saveAiSettings: (request: SaveAiSettingsRequest) => Promise<AiSettings>;
  createAiService: (preset: AiServicePreset) => Promise<AiSettings>;
  selectAiService: (serviceId: string) => Promise<AiSettings>;
  deleteAiService: (serviceId: string) => Promise<AiSettings>;
  listAiModels: (request: AiModelsRequest) => Promise<AiModelsResult>;
  testAiConnection: (request: AiModelsRequest) => Promise<AiConnectionTestResult>;
  evaluateJob: (request: JobEvaluationRequest) => Promise<JobEvaluationRunResult>;
  getAtsWorkspace: () => Promise<AtsWorkspace>;
  savePortals: (request: SavePortalsRequest) => Promise<PortalSaveResult>;
  startScan: (request: ScanRequest) => Promise<ScanRunStatus>;
  getScanStatus: () => Promise<ScanRunStatus>;
  cancelScan: () => Promise<ScanRunStatus>;
  getAutomationWorkspace: () => Promise<AutomationWorkspace>;
  startBatch: (options: BatchOptions) => Promise<BatchRunStatus>;
  getBatchStatus: () => Promise<BatchRunStatus>;
  cancelBatch: () => Promise<BatchRunStatus>;
  saveDailyAutomation: (request: SaveDailyAutomationRequest) => Promise<DailyAutomationConfig>;
  getApplicationMaterialsWorkspace: () => Promise<ApplicationMaterialsWorkspace>;
  generateApplicationMaterials: (request: GenerateApplicationMaterialsRequest) => Promise<GenerateApplicationMaterialsResult>;
  compareApplicationMaterialVersions: (packageId: string, fromVersion: number, toVersion: number) => Promise<MaterialComparison>;
  openApplicationMaterial: (packageId: string, version: number, relativePath: string) => Promise<{ ok: boolean; message: string }>;
  updateTrackerStatus: (request: TrackerStatusChangeRequest) => Promise<TrackerMutationResult>;
  seedFollowup: (rowNumber: string) => Promise<TrackerMutationResult>;
  getFollowupCadence: () => Promise<FollowupCadenceResult>;
  analyzeReply: (reply: ReplyDraft) => Promise<ReplyRecommendation>;
  matchInvite: (inviteText: string) => Promise<InviteMatchResult>;
  recordOutcome: (request: OutcomeRequest) => Promise<TrackerMutationResult>;
};
