import { contextBridge, ipcRenderer } from 'electron';
import type {
  JobEvaluationRequest,
  SaveAiSettingsRequest,
  CareerOpsDesktopApi,
  ConfirmPositioningRequest,
  SaveCvRequest,
  SaveProfileRequest,
  SavePortalsRequest,
  ScanRequest,
  BatchOptions,
  SaveDailyAutomationRequest,
  GenerateApplicationMaterialsRequest,
  AiServicePreset,
  AiModelsRequest,
  OutcomeRequest,
  ReplyDraft,
  TrackerStatusChangeRequest,
} from './contracts';

const api: CareerOpsDesktopApi = Object.freeze({
  getSnapshot: () => ipcRenderer.invoke('career-ops:get-snapshot'),
  selectDirectory: () => ipcRenderer.invoke('career-ops:select-directory'),
  readReport: (name: string) => {
    if (typeof name !== 'string' || name.length === 0 || name.length > 240) {
      return Promise.reject(new Error('Invalid report name.'));
    }
    return ipcRenderer.invoke('career-ops:read-report', name);
  },
  saveProfile: (request: SaveProfileRequest) => {
    if (!request || typeof request !== 'object') {
      return Promise.reject(new Error('Invalid profile save request.'));
    }
    return ipcRenderer.invoke('career-ops:save-profile', request);
  },
  saveCv: (request: SaveCvRequest) => {
    if (!request || typeof request !== 'object') {
      return Promise.reject(new Error('Invalid CV save request.'));
    }
    return ipcRenderer.invoke('career-ops:save-cv', request);
  },
  getCompetitivenessAnalysis: () => (
    ipcRenderer.invoke('career-ops:get-competitiveness-analysis')
  ),
  runAiCompetitivenessAnalysis: () => (
    ipcRenderer.invoke('career-ops:run-ai-competitiveness-analysis')
  ),
  confirmPositioning: (request: ConfirmPositioningRequest) => {
    if (!request || typeof request !== 'object') {
      return Promise.reject(new Error('Invalid positioning confirmation request.'));
    }
    return ipcRenderer.invoke('career-ops:confirm-positioning', request);
  },
  getAiSettings: () => ipcRenderer.invoke('career-ops:get-ai-settings'),
  saveAiSettings: (request: SaveAiSettingsRequest) => {
    if (!request || typeof request !== 'object') {
      return Promise.reject(new Error('Invalid AI settings request.'));
    }
    return ipcRenderer.invoke('career-ops:save-ai-settings', request);
  },
  createAiService: (preset: AiServicePreset) => {
    if (typeof preset !== 'string') return Promise.reject(new Error('Invalid AI service preset.'));
    return ipcRenderer.invoke('career-ops:create-ai-service', preset);
  },
  selectAiService: (serviceId: string) => {
    if (typeof serviceId !== 'string') return Promise.reject(new Error('Invalid AI service ID.'));
    return ipcRenderer.invoke('career-ops:select-ai-service', serviceId);
  },
  deleteAiService: (serviceId: string) => {
    if (typeof serviceId !== 'string') return Promise.reject(new Error('Invalid AI service ID.'));
    return ipcRenderer.invoke('career-ops:delete-ai-service', serviceId);
  },
  listAiModels: (request: AiModelsRequest) => {
    if (!request || typeof request !== 'object') return Promise.reject(new Error('Invalid model list request.'));
    return ipcRenderer.invoke('career-ops:list-ai-models', request);
  },
  testAiConnection: (request: AiModelsRequest) => {
    if (!request || typeof request !== 'object') return Promise.reject(new Error('Invalid connection test request.'));
    return ipcRenderer.invoke('career-ops:test-ai-connection', request);
  },
  evaluateJob: (request: JobEvaluationRequest) => {
    if (
      !request
      || typeof request !== 'object'
      || !['url', 'jd'].includes(request.inputKind)
      || typeof request.input !== 'string'
    ) {
      return Promise.reject(new Error('Invalid job evaluation request.'));
    }
    return ipcRenderer.invoke('career-ops:evaluate-job', request);
  },
  getAtsWorkspace: () => ipcRenderer.invoke('career-ops:get-ats-workspace'),
  savePortals: (request: SavePortalsRequest) => {
    if (!request || typeof request !== 'object') {
      return Promise.reject(new Error('Invalid portal save request.'));
    }
    return ipcRenderer.invoke('career-ops:save-portals', request);
  },
  startScan: (request: ScanRequest) => {
    if (!request || typeof request !== 'object' || !['quick', 'full'].includes(request.kind)) {
      return Promise.reject(new Error('Invalid scan request.'));
    }
    return ipcRenderer.invoke('career-ops:start-scan', request);
  },
  getScanStatus: () => ipcRenderer.invoke('career-ops:get-scan-status'),
  cancelScan: () => ipcRenderer.invoke('career-ops:cancel-scan'),
  getAutomationWorkspace: () => ipcRenderer.invoke('career-ops:get-automation-workspace'),
  startBatch: (options: BatchOptions) => {
    if (!options || typeof options !== 'object') return Promise.reject(new Error('Invalid batch options.'));
    return ipcRenderer.invoke('career-ops:start-batch', options);
  },
  getBatchStatus: () => ipcRenderer.invoke('career-ops:get-batch-status'),
  cancelBatch: () => ipcRenderer.invoke('career-ops:cancel-batch'),
  saveDailyAutomation: (request: SaveDailyAutomationRequest) => {
    if (!request || typeof request !== 'object') return Promise.reject(new Error('Invalid daily automation request.'));
    return ipcRenderer.invoke('career-ops:save-daily-automation', request);
  },
  getApplicationMaterialsWorkspace: () => ipcRenderer.invoke('career-ops:get-application-materials-workspace'),
  generateApplicationMaterials: (request: GenerateApplicationMaterialsRequest) => {
    if (!request || typeof request !== 'object') return Promise.reject(new Error('Invalid application materials request.'));
    return ipcRenderer.invoke('career-ops:generate-application-materials', request);
  },
  compareApplicationMaterialVersions: (packageId: string, fromVersion: number, toVersion: number) => {
    if (typeof packageId !== 'string' || !Number.isInteger(fromVersion) || !Number.isInteger(toVersion)) {
      return Promise.reject(new Error('Invalid material comparison request.'));
    }
    return ipcRenderer.invoke('career-ops:compare-application-material-versions', packageId, fromVersion, toVersion);
  },
  openApplicationMaterial: (packageId: string, version: number, relativePath: string) => {
    if (typeof packageId !== 'string' || !Number.isInteger(version) || typeof relativePath !== 'string') {
      return Promise.reject(new Error('Invalid material open request.'));
    }
    return ipcRenderer.invoke('career-ops:open-application-material', packageId, version, relativePath);
  },
  updateTrackerStatus: (request: TrackerStatusChangeRequest) => {
    if (!request || typeof request !== 'object') return Promise.reject(new Error('Invalid tracker update request.'));
    return ipcRenderer.invoke('career-ops:update-tracker-status', request);
  },
  seedFollowup: (rowNumber: string) => {
    if (typeof rowNumber !== 'string') return Promise.reject(new Error('Invalid follow-up request.'));
    return ipcRenderer.invoke('career-ops:seed-followup', rowNumber);
  },
  getFollowupCadence: () => ipcRenderer.invoke('career-ops:get-followup-cadence'),
  analyzeReply: (reply: ReplyDraft) => {
    if (!reply || typeof reply !== 'object') return Promise.reject(new Error('Invalid reply request.'));
    return ipcRenderer.invoke('career-ops:analyze-reply', reply);
  },
  matchInvite: (inviteText: string) => {
    if (typeof inviteText !== 'string') return Promise.reject(new Error('Invalid invite request.'));
    return ipcRenderer.invoke('career-ops:match-invite', inviteText);
  },
  recordOutcome: (request: OutcomeRequest) => {
    if (!request || typeof request !== 'object') return Promise.reject(new Error('Invalid outcome request.'));
    return ipcRenderer.invoke('career-ops:record-outcome', request);
  },
});

contextBridge.exposeInMainWorld('careerOps', api);
