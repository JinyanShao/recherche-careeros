import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  Notification,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import path from 'node:path';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import { loadCareerOpsSnapshot, readReport, validateCareerOpsRoot } from './career-ops-reader';
import {
  RevisionConflictError,
  confirmPositioning,
  saveCv,
  saveProfile,
} from './profile-store';
import { buildCompetitivenessAnalysis } from './competitiveness-analysis';
import { enhanceWithAi } from './ai-analysis-runner';
import {
  createAiService,
  deleteAiService,
  getAiSettings,
  listAiModels,
  saveAiSettings,
  selectAiService,
  testAiConnection,
} from './ai-settings-store';
import { runJobEvaluation } from './job-evaluation-runner';
import { loadAtsWorkspace } from './ats-center';
import { loadPortalConfig, savePortalConfig } from './portal-store';
import { cancelScan, getScanStatus, startScan } from './scan-controller';
import {
  cancelBatch,
  getBatchStatus,
  getRecentBatchLog,
  startBatch,
  synchronizeBatchJobs,
  waitForBatchCompletion,
} from './batch-runner';
import { loadDailyAutomation, saveDailyAutomation } from './launch-agent-store';
import {
  compareApplicationMaterialVersions,
  generateApplicationMaterials,
  loadApplicationMaterialsWorkspace,
  resolveMaterialPath,
} from './application-materials';
import {
  analyzeReply,
  getFollowupCadence,
  matchInvite,
  recordOutcome,
  seedFollowup,
  updateTrackerStatus,
} from './tracker-lifecycle';
import type {
  AiSettings,
  AiServicePreset,
  AiModelsRequest,
  AiModelsResult,
  AiConnectionTestResult,
  CompetitivenessAnalysis,
  ConfirmPositioningRequest,
  JobEvaluationRequest,
  JobEvaluationRunResult,
  SaveAiSettingsRequest,
  SaveCvRequest,
  SaveProfileRequest,
  SaveResult,
  PortalSaveResult,
  SavePortalsRequest,
  ScanRequest,
  ScanRunStatus,
  AutomationWorkspace,
  BatchOptions,
  BatchRunStatus,
  DailyAutomationConfig,
  HighScoreMatch,
  SaveDailyAutomationRequest,
  GenerateApplicationMaterialsRequest,
  GenerateApplicationMaterialsResult,
  MaterialComparison,
  ApplicationMaterialsWorkspace,
  FollowupCadenceResult,
  InviteMatchResult,
  OutcomeRequest,
  ReplyDraft,
  ReplyRecommendation,
  TrackerMutationResult,
  TrackerStatusChangeRequest,
} from './contracts';

const CHANNELS = {
  getSnapshot: 'career-ops:get-snapshot',
  selectDirectory: 'career-ops:select-directory',
  readReport: 'career-ops:read-report',
  saveProfile: 'career-ops:save-profile',
  saveCv: 'career-ops:save-cv',
  getAnalysis: 'career-ops:get-competitiveness-analysis',
  runAiAnalysis: 'career-ops:run-ai-competitiveness-analysis',
  confirmPositioning: 'career-ops:confirm-positioning',
  getAiSettings: 'career-ops:get-ai-settings',
  saveAiSettings: 'career-ops:save-ai-settings',
  createAiService: 'career-ops:create-ai-service',
  selectAiService: 'career-ops:select-ai-service',
  deleteAiService: 'career-ops:delete-ai-service',
  listAiModels: 'career-ops:list-ai-models',
  testAiConnection: 'career-ops:test-ai-connection',
  evaluateJob: 'career-ops:evaluate-job',
  getAtsWorkspace: 'career-ops:get-ats-workspace',
  savePortals: 'career-ops:save-portals',
  startScan: 'career-ops:start-scan',
  getScanStatus: 'career-ops:get-scan-status',
  cancelScan: 'career-ops:cancel-scan',
  getAutomationWorkspace: 'career-ops:get-automation-workspace',
  startBatch: 'career-ops:start-batch',
  getBatchStatus: 'career-ops:get-batch-status',
  cancelBatch: 'career-ops:cancel-batch',
  saveDailyAutomation: 'career-ops:save-daily-automation',
  getApplicationMaterialsWorkspace: 'career-ops:get-application-materials-workspace',
  generateApplicationMaterials: 'career-ops:generate-application-materials',
  compareApplicationMaterialVersions: 'career-ops:compare-application-material-versions',
  openApplicationMaterial: 'career-ops:open-application-material',
  updateTrackerStatus: 'career-ops:update-tracker-status',
  seedFollowup: 'career-ops:seed-followup',
  getFollowupCadence: 'career-ops:get-followup-cadence',
  analyzeReply: 'career-ops:analyze-reply',
  matchInvite: 'career-ops:match-invite',
  recordOutcome: 'career-ops:record-outcome',
} as const;

let mainWindow: BrowserWindow | null = null;
const headlessDailyBatch = process.argv.includes('--recherche-daily-batch');
const rootArgumentIndex = process.argv.indexOf('--career-ops-root');
const argumentRoot = rootArgumentIndex >= 0 ? process.argv[rootArgumentIndex + 1]?.trim() : '';
let careerOpsRoot = argumentRoot
  || process.env.RECHERCHE_CAREER_OPS_SOURCE?.trim()
  || process.env.CAREER_OPS_ROOT?.trim()
  || '';
const analysisCache = new Map<string, CompetitivenessAnalysis>();

if (headlessDailyBatch) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'recherche',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
]);

if (started) {
  app.quit();
}

if (!headlessDailyBatch) {
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) app.quit();
}

function notifyHighMatch(match: HighScoreMatch): void {
  const testLog = process.env.RECHERCHE_NOTIFICATION_LOG?.trim();
  if (testLog) appendFileSync(testLog, `${JSON.stringify(match)}\n`, { encoding: 'utf8' });
  if (!Notification.isSupported()) return;
  new Notification({
    title: `${match.score.toFixed(1)}/5 高匹配岗位`,
    body: `${match.company} · ${match.role}`,
    silent: false,
  }).show();
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (
    !mainWindow
    || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents
    || event.senderFrame !== mainWindow.webContents.mainFrame
  ) {
    throw new Error('Rejected IPC request from an untrusted renderer.');
  }
}

function saveFailure(error: unknown): SaveResult {
  if (error instanceof RevisionConflictError) {
    return { ok: false, kind: 'conflict', message: error.message };
  }
  if (
    error instanceof Error
    && /必须|无效|过长|过多|范围|解析|一级标题/.test(error.message)
  ) {
    return { ok: false, kind: 'validation', message: error.message };
  }
  return {
    ok: false,
    kind: 'io',
    message: error instanceof Error ? error.message : '保存失败。',
  };
}

function registerCareerOpsIpc(): void {
  ipcMain.removeHandler(CHANNELS.getSnapshot);
  ipcMain.removeHandler(CHANNELS.selectDirectory);
  ipcMain.removeHandler(CHANNELS.readReport);
  ipcMain.removeHandler(CHANNELS.saveProfile);
  ipcMain.removeHandler(CHANNELS.saveCv);
  ipcMain.removeHandler(CHANNELS.getAnalysis);
  ipcMain.removeHandler(CHANNELS.runAiAnalysis);
  ipcMain.removeHandler(CHANNELS.confirmPositioning);
  ipcMain.removeHandler(CHANNELS.getAiSettings);
  ipcMain.removeHandler(CHANNELS.saveAiSettings);
  ipcMain.removeHandler(CHANNELS.createAiService);
  ipcMain.removeHandler(CHANNELS.selectAiService);
  ipcMain.removeHandler(CHANNELS.deleteAiService);
  ipcMain.removeHandler(CHANNELS.listAiModels);
  ipcMain.removeHandler(CHANNELS.testAiConnection);
  ipcMain.removeHandler(CHANNELS.evaluateJob);
  ipcMain.removeHandler(CHANNELS.getAtsWorkspace);
  ipcMain.removeHandler(CHANNELS.savePortals);
  ipcMain.removeHandler(CHANNELS.startScan);
  ipcMain.removeHandler(CHANNELS.getScanStatus);
  ipcMain.removeHandler(CHANNELS.cancelScan);
  ipcMain.removeHandler(CHANNELS.getAutomationWorkspace);
  ipcMain.removeHandler(CHANNELS.startBatch);
  ipcMain.removeHandler(CHANNELS.getBatchStatus);
  ipcMain.removeHandler(CHANNELS.cancelBatch);
  ipcMain.removeHandler(CHANNELS.saveDailyAutomation);
  ipcMain.removeHandler(CHANNELS.getApplicationMaterialsWorkspace);
  ipcMain.removeHandler(CHANNELS.generateApplicationMaterials);
  ipcMain.removeHandler(CHANNELS.compareApplicationMaterialVersions);
  ipcMain.removeHandler(CHANNELS.openApplicationMaterial);
  ipcMain.removeHandler(CHANNELS.updateTrackerStatus);
  ipcMain.removeHandler(CHANNELS.seedFollowup);
  ipcMain.removeHandler(CHANNELS.getFollowupCadence);
  ipcMain.removeHandler(CHANNELS.analyzeReply);
  ipcMain.removeHandler(CHANNELS.matchInvite);
  ipcMain.removeHandler(CHANNELS.recordOutcome);

  ipcMain.handle(CHANNELS.getSnapshot, (event) => {
    assertTrustedSender(event);
    return loadCareerOpsSnapshot(careerOpsRoot);
  });

  ipcMain.handle(CHANNELS.selectDirectory, async (event) => {
    assertTrustedSender(event);
    if (!mainWindow) return { cancelled: true, snapshot: null };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '连接现有求职资料',
      message: '选择你此前使用的 Recherche CareerOS 或 career-ops 资料文件夹。',
      buttonLabel: '连接资料',
      defaultPath: careerOpsRoot,
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length !== 1) {
      return { cancelled: true, snapshot: null };
    }
    const selectedSnapshot = loadCareerOpsSnapshot(result.filePaths[0]);
    if (selectedSnapshot.validation.valid) {
      careerOpsRoot = selectedSnapshot.validation.root;
      analysisCache.clear();
    }
    return { cancelled: false, snapshot: selectedSnapshot };
  });

  ipcMain.handle(CHANNELS.readReport, (event, name: unknown) => {
    assertTrustedSender(event);
    if (typeof name !== 'string') throw new Error('Invalid report request.');
    const validation = validateCareerOpsRoot(careerOpsRoot);
    if (!validation.valid) throw new Error('The career-ops workspace is not valid.');
    return readReport(validation.root, name);
  });

  ipcMain.handle(CHANNELS.saveProfile, async (event, request: unknown): Promise<SaveResult> => {
    assertTrustedSender(event);
    try {
      const backupDirectory = await saveProfile(careerOpsRoot, request as SaveProfileRequest);
      analysisCache.clear();
      return {
        ok: true,
        backupDirectory,
        snapshot: loadCareerOpsSnapshot(careerOpsRoot),
      };
    } catch (error) {
      return saveFailure(error);
    }
  });

  ipcMain.handle(CHANNELS.saveCv, async (event, request: unknown): Promise<SaveResult> => {
    assertTrustedSender(event);
    try {
      const backupDirectory = await saveCv(careerOpsRoot, request as SaveCvRequest);
      analysisCache.clear();
      return {
        ok: true,
        backupDirectory,
        snapshot: loadCareerOpsSnapshot(careerOpsRoot),
      };
    } catch (error) {
      return saveFailure(error);
    }
  });

  ipcMain.handle(CHANNELS.getAnalysis, (event): CompetitivenessAnalysis => {
    assertTrustedSender(event);
    const snapshot = loadCareerOpsSnapshot(careerOpsRoot);
    if (!snapshot.validation.valid) throw new Error('请选择有效的 career-ops 工作区。');
    const analysis = buildCompetitivenessAnalysis(snapshot);
    analysisCache.set(analysis.id, analysis);
    return analysis;
  });

  ipcMain.handle(CHANNELS.runAiAnalysis, async (event): Promise<CompetitivenessAnalysis> => {
    assertTrustedSender(event);
    const snapshot = loadCareerOpsSnapshot(careerOpsRoot);
    if (!snapshot.validation.valid) throw new Error('请选择有效的 career-ops 工作区。');
    const baseline = buildCompetitivenessAnalysis(snapshot);
    const analysis = await enhanceWithAi(careerOpsRoot, snapshot, baseline);
    analysisCache.set(analysis.id, analysis);
    return analysis;
  });

  ipcMain.handle(CHANNELS.confirmPositioning, async (
    event,
    request: unknown,
  ): Promise<SaveResult> => {
    assertTrustedSender(event);
    try {
      if (!request || typeof request !== 'object') throw new Error('定位确认请求格式无效。');
      const typedRequest = request as ConfirmPositioningRequest;
      const cached = analysisCache.get(typedRequest.analysisId);
      if (!cached) throw new Error('分析草案已失效，请重新生成后再确认。');
      const currentSnapshot = loadCareerOpsSnapshot(careerOpsRoot);
      const currentBaseline = buildCompetitivenessAnalysis(currentSnapshot);
      if (
        cached.inputRevision.cv !== currentBaseline.inputRevision.cv
        || cached.inputRevision.profile !== currentBaseline.inputRevision.profile
        || cached.inputRevision.pipeline !== currentBaseline.inputRevision.pipeline
      ) {
        throw new RevisionConflictError('competitiveness analysis');
      }
      const backupDirectory = await confirmPositioning(
        careerOpsRoot,
        typedRequest.expectedRevision,
        typedRequest.analysisId,
        cached.positioning,
      );
      analysisCache.clear();
      return {
        ok: true,
        backupDirectory,
        snapshot: loadCareerOpsSnapshot(careerOpsRoot),
      };
    } catch (error) {
      return saveFailure(error);
    }
  });

  ipcMain.handle(CHANNELS.getAiSettings, async (event): Promise<AiSettings> => {
    assertTrustedSender(event);
    return getAiSettings();
  });

  ipcMain.handle(CHANNELS.saveAiSettings, async (event, request: unknown): Promise<AiSettings> => {
    assertTrustedSender(event);
    return saveAiSettings(request as SaveAiSettingsRequest);
  });

  ipcMain.handle(CHANNELS.createAiService, async (event, preset: unknown): Promise<AiSettings> => {
    assertTrustedSender(event);
    if (typeof preset !== 'string') throw new Error('模型服务预设无效。');
    return createAiService(preset as AiServicePreset);
  });

  ipcMain.handle(CHANNELS.selectAiService, async (event, serviceId: unknown): Promise<AiSettings> => {
    assertTrustedSender(event);
    if (typeof serviceId !== 'string') throw new Error('模型服务 ID 无效。');
    return selectAiService(serviceId);
  });

  ipcMain.handle(CHANNELS.deleteAiService, async (event, serviceId: unknown): Promise<AiSettings> => {
    assertTrustedSender(event);
    if (typeof serviceId !== 'string') throw new Error('模型服务 ID 无效。');
    return deleteAiService(serviceId);
  });

  ipcMain.handle(CHANNELS.listAiModels, async (event, request: unknown): Promise<AiModelsResult> => {
    assertTrustedSender(event);
    return listAiModels(request as AiModelsRequest);
  });

  ipcMain.handle(CHANNELS.testAiConnection, async (event, request: unknown): Promise<AiConnectionTestResult> => {
    assertTrustedSender(event);
    return testAiConnection(request as AiModelsRequest);
  });

  ipcMain.handle(CHANNELS.evaluateJob, async (
    event,
    request: unknown,
  ): Promise<JobEvaluationRunResult> => {
    assertTrustedSender(event);
    const snapshot = loadCareerOpsSnapshot(careerOpsRoot);
    if (!snapshot.validation.valid) {
      return {
        ok: false,
        error: {
          stage: 'input',
          code: 'invalid_workspace',
          message: '请选择有效的 career-ops 工作区。',
          detail: 'Workspace validation failed.',
        },
      };
    }
    const result = await runJobEvaluation(careerOpsRoot, request as JobEvaluationRequest);
    if (result.ok === false) return result;
    analysisCache.clear();
    return {
      ok: true,
      evaluation: result.evaluation,
      snapshot: loadCareerOpsSnapshot(careerOpsRoot),
    };
  });

  ipcMain.handle(CHANNELS.getAtsWorkspace, async (event) => {
    assertTrustedSender(event);
    const current = loadCareerOpsSnapshot(careerOpsRoot);
    if (!current.validation.valid) throw new Error('请选择有效的 career-ops 工作区。');
    return loadAtsWorkspace(careerOpsRoot);
  });

  ipcMain.handle(CHANNELS.savePortals, async (
    event,
    request: unknown,
  ): Promise<PortalSaveResult> => {
    assertTrustedSender(event);
    try {
      const backupDirectory = await savePortalConfig(careerOpsRoot, request as SavePortalsRequest);
      return { ok: true, backupDirectory, portals: await loadPortalConfig(careerOpsRoot) };
    } catch (error) {
      return saveFailure(error) as PortalSaveResult;
    }
  });

  ipcMain.handle(CHANNELS.startScan, async (
    event,
    request: unknown,
  ): Promise<ScanRunStatus> => {
    assertTrustedSender(event);
    const current = loadCareerOpsSnapshot(careerOpsRoot);
    if (!current.validation.valid) throw new Error('请选择有效的 career-ops 工作区。');
    return startScan(careerOpsRoot, request as ScanRequest);
  });

  ipcMain.handle(CHANNELS.getScanStatus, (event): ScanRunStatus => {
    assertTrustedSender(event);
    return getScanStatus();
  });

  ipcMain.handle(CHANNELS.cancelScan, (event): ScanRunStatus => {
    assertTrustedSender(event);
    return cancelScan();
  });

  ipcMain.handle(CHANNELS.getAutomationWorkspace, async (event): Promise<AutomationWorkspace> => {
    assertTrustedSender(event);
    const current = loadCareerOpsSnapshot(careerOpsRoot);
    if (!current.validation.valid) throw new Error('请选择有效的 career-ops 工作区。');
    const [jobs, schedule, recentLog] = await Promise.all([
      synchronizeBatchJobs(careerOpsRoot),
      loadDailyAutomation(careerOpsRoot),
      getRecentBatchLog(careerOpsRoot),
    ]);
    return {
      loadedAt: new Date().toISOString(), pendingPipeline: current.pipeline.pending,
      jobs, run: getBatchStatus(), schedule, recentLog,
    };
  });

  ipcMain.handle(CHANNELS.startBatch, async (event, options: unknown): Promise<BatchRunStatus> => {
    assertTrustedSender(event);
    const current = loadCareerOpsSnapshot(careerOpsRoot);
    if (!current.validation.valid) throw new Error('请选择有效的 career-ops 工作区。');
    return startBatch(careerOpsRoot, options as BatchOptions, { onHighMatch: notifyHighMatch });
  });

  ipcMain.handle(CHANNELS.getBatchStatus, (event): BatchRunStatus => {
    assertTrustedSender(event);
    return getBatchStatus();
  });

  ipcMain.handle(CHANNELS.cancelBatch, (event): BatchRunStatus => {
    assertTrustedSender(event);
    return cancelBatch();
  });

  ipcMain.handle(CHANNELS.saveDailyAutomation, async (
    event,
    request: unknown,
  ): Promise<DailyAutomationConfig> => {
    assertTrustedSender(event);
    return saveDailyAutomation(careerOpsRoot, request as SaveDailyAutomationRequest);
  });

  ipcMain.handle(CHANNELS.getApplicationMaterialsWorkspace, async (event): Promise<ApplicationMaterialsWorkspace> => {
    assertTrustedSender(event);
    const current = loadCareerOpsSnapshot(careerOpsRoot);
    if (!current.validation.valid) throw new Error('请选择有效的 career-ops 工作区。');
    return loadApplicationMaterialsWorkspace(careerOpsRoot);
  });

  ipcMain.handle(CHANNELS.generateApplicationMaterials, async (
    event,
    request: unknown,
  ): Promise<GenerateApplicationMaterialsResult> => {
    assertTrustedSender(event);
    const current = loadCareerOpsSnapshot(careerOpsRoot);
    if (!current.validation.valid) {
      return { ok: false, stage: 'input', message: '请选择有效的 career-ops 工作区。', detail: 'Workspace validation failed.' };
    }
    return generateApplicationMaterials(careerOpsRoot, request as GenerateApplicationMaterialsRequest);
  });

  ipcMain.handle(CHANNELS.compareApplicationMaterialVersions, async (
    event,
    packageId: unknown,
    fromVersion: unknown,
    toVersion: unknown,
  ): Promise<MaterialComparison> => {
    assertTrustedSender(event);
    if (typeof packageId !== 'string' || typeof fromVersion !== 'number' || typeof toVersion !== 'number') {
      throw new Error('版本比较请求无效。');
    }
    return compareApplicationMaterialVersions(careerOpsRoot, packageId, fromVersion, toVersion);
  });

  ipcMain.handle(CHANNELS.openApplicationMaterial, async (
    event,
    packageId: unknown,
    version: unknown,
    relativePath: unknown,
  ): Promise<{ ok: boolean; message: string }> => {
    assertTrustedSender(event);
    if (typeof packageId !== 'string' || typeof version !== 'number' || typeof relativePath !== 'string') {
      throw new Error('材料打开请求无效。');
    }
    const file = await resolveMaterialPath(careerOpsRoot, packageId, version, relativePath);
    const message = await shell.openPath(file);
    return { ok: message === '', message };
  });

  ipcMain.handle(CHANNELS.updateTrackerStatus, async (
    event,
    request: unknown,
  ): Promise<TrackerMutationResult> => {
    assertTrustedSender(event);
    return updateTrackerStatus(careerOpsRoot, request as TrackerStatusChangeRequest);
  });

  ipcMain.handle(CHANNELS.seedFollowup, async (event, rowNumber: unknown): Promise<TrackerMutationResult> => {
    assertTrustedSender(event);
    if (typeof rowNumber !== 'string') throw new Error('跟进行号无效。');
    return seedFollowup(careerOpsRoot, rowNumber);
  });

  ipcMain.handle(CHANNELS.getFollowupCadence, async (event): Promise<FollowupCadenceResult> => {
    assertTrustedSender(event);
    return getFollowupCadence(careerOpsRoot);
  });

  ipcMain.handle(CHANNELS.analyzeReply, async (event, reply: unknown): Promise<ReplyRecommendation> => {
    assertTrustedSender(event);
    return analyzeReply(careerOpsRoot, reply as ReplyDraft);
  });

  ipcMain.handle(CHANNELS.matchInvite, async (event, inviteText: unknown): Promise<InviteMatchResult> => {
    assertTrustedSender(event);
    if (typeof inviteText !== 'string') throw new Error('面试邀请内容无效。');
    return matchInvite(careerOpsRoot, inviteText);
  });

  ipcMain.handle(CHANNELS.recordOutcome, async (event, request: unknown): Promise<TrackerMutationResult> => {
    assertTrustedSender(event);
    return recordOutcome(careerOpsRoot, request as OutcomeRequest);
  });
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function registerRendererProtocol(): void {
  const rendererRoot = path.resolve(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}`,
  );

  protocol.handle('recherche', (request) => {
    const requestUrl = new URL(request.url);
    if (requestUrl.host !== 'renderer') {
      return new Response('Not found', { status: 404 });
    }

    let relativePath: string;
    try {
      relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html';
    } catch {
      return new Response('Invalid path', { status: 400 });
    }

    const assetPath = path.resolve(rendererRoot, relativePath);
    if (!isPathInside(rendererRoot, assetPath)) {
      return new Response('Forbidden', { status: 403 });
    }

    return net.fetch(pathToFileURL(assetPath).toString());
  });
}

function createWindow(): void {
  const rendererUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL
    || 'recherche://renderer/index.html';
  const rendererOrigin = new URL(rendererUrl).origin;

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    title: 'Recherche CareerOS',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#eef2ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const navigationUrl = new URL(url);
    const isTrustedNavigation = MAIN_WINDOW_VITE_DEV_SERVER_URL
      ? navigationUrl.origin === rendererOrigin
      : navigationUrl.toString() === rendererUrl;
    if (!isTrustedNavigation) {
      event.preventDefault();
    }
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(rendererUrl);
}

app.whenReady().then(async () => {
  if (headlessDailyBatch) {
    try {
      const schedule = await loadDailyAutomation(careerOpsRoot);
      if (!schedule.enabled) throw new Error('每日自动化已停用。');
      await startBatch(careerOpsRoot, { ...schedule.options, resumeIncomplete: true }, { onHighMatch: notifyHighMatch });
      const result = await waitForBatchCompletion();
      if (result.state === 'failed') process.exitCode = 1;
    } catch (error) {
      process.stderr.write(`Recherche CareerOS daily batch failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    } finally {
      app.quit();
    }
    return;
  }
  registerRendererProtocol();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  registerCareerOpsIpc();
  createWindow();
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (headlessDailyBatch) return;
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
