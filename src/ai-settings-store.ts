import { randomUUID } from 'node:crypto';
import { app, safeStorage } from 'electron';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import type {
  AiConnectionTestResult,
  AiModelsRequest,
  AiModelsResult,
  AiProviderKind,
  AiServicePreset,
  AiServiceSettings,
  AiSettings,
  SaveAiSettingsRequest,
} from './contracts';

type StoredService = Omit<AiServiceSettings, 'keyConfigured' | 'keyHint'> & {
  encryptedApiKey: string;
  keyHint: string;
};

type StoredSettingsV2 = {
  version: 2;
  activeServiceId: string;
  services: StoredService[];
};

type StoredSettingsV1 = {
  version?: 1;
  provider?: AiProviderKind;
  baseUrl?: string;
  model?: string;
  inputPricePerMillion?: number | null;
  outputPricePerMillion?: number | null;
  encryptedApiKey?: string;
  keyHint?: string;
};

export type AiCredentials = Omit<StoredService, 'encryptedApiKey' | 'keyHint'> & {
  apiKey: string;
};

const PRESETS: Record<AiServicePreset, Omit<StoredService, 'id' | 'encryptedApiKey' | 'keyHint'>> = {
  openai: { name: 'OpenAI', provider: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-sol', temperature: 0.1, maxOutputTokens: 12_000, timeoutSeconds: 180, supportsVision: true, inputPricePerMillion: null, outputPricePerMillion: null },
  deepseek: { name: 'DeepSeek', provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', temperature: 0.1, maxOutputTokens: 8_000, timeoutSeconds: 180, supportsVision: false, inputPricePerMillion: null, outputPricePerMillion: null },
  anthropic: { name: 'Anthropic', provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', temperature: 0.1, maxOutputTokens: 12_000, timeoutSeconds: 180, supportsVision: true, inputPricePerMillion: null, outputPricePerMillion: null },
  openrouter: { name: 'OpenRouter', provider: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-5.6-sol', temperature: 0.1, maxOutputTokens: 12_000, timeoutSeconds: 180, supportsVision: true, inputPricePerMillion: null, outputPricePerMillion: null },
  ollama: { name: 'Ollama', provider: 'openai-compatible', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', temperature: 0.1, maxOutputTokens: 8_000, timeoutSeconds: 180, supportsVision: false, inputPricePerMillion: null, outputPricePerMillion: null },
  'lm-studio': { name: 'LM Studio', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', model: 'local-model', temperature: 0.1, maxOutputTokens: 8_000, timeoutSeconds: 180, supportsVision: false, inputPricePerMillion: null, outputPricePerMillion: null },
  custom: { name: '自定义服务', provider: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-sol', temperature: 0.1, maxOutputTokens: 12_000, timeoutSeconds: 180, supportsVision: false, inputPricePerMillion: null, outputPricePerMillion: null },
};

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'ai-provider-settings.json');
}

function cleanText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`${label}格式无效。`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || normalized.includes('\u0000')) throw new Error(`${label}为空或过长。`);
  return normalized;
}

function cleanId(value: unknown): string {
  const id = cleanText(value, '服务 ID', 100);
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('服务 ID 无效。');
  return id;
}

function cleanPrice(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1_000_000) throw new Error(`${label}必须是非负数字。`);
  return numeric;
}

function cleanNumber(value: unknown, label: string, minimum: number, maximum: number, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) throw new Error(`${label}必须在 ${minimum} 到 ${maximum} 之间。`);
  return numeric;
}

function provider(value: unknown): AiProviderKind {
  if (value === 'anthropic' || value === 'openai-compatible') return value;
  throw new Error('不支持的模型接口类型。');
}

function cleanBaseUrl(value: unknown, kind: AiProviderKind): string {
  const raw = cleanText(value, 'API 地址', 500);
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error('API 地址不是有效 URL。'); }
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname.toLowerCase());
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) throw new Error('API 地址必须使用 HTTPS；本机 localhost 服务可使用 HTTP。');
  if (parsed.username || parsed.password) throw new Error('API 地址不能包含用户名或密码。');
  parsed.hash = ''; parsed.search = '';
  let pathname = parsed.pathname.replace(/\/+$/, '');
  if (kind === 'openai-compatible') pathname = pathname.replace(/\/chat\/completions$/i, '');
  else pathname = pathname.replace(/\/v1\/messages$/i, '');
  parsed.pathname = pathname || '/';
  return parsed.toString().replace(/\/$/, '');
}

function makeService(preset: AiServicePreset, name?: string): StoredService {
  return { id: randomUUID(), ...PRESETS[preset], name: name ?? PRESETS[preset].name, encryptedApiKey: '', keyHint: '' };
}

function defaultSettings(): StoredSettingsV2 {
  const service = makeService('deepseek');
  return { version: 2, activeServiceId: service.id, services: [service] };
}

function normalizeService(value: unknown): StoredService {
  if (!value || typeof value !== 'object') throw new Error('模型服务格式无效。');
  const item = value as Partial<StoredService>;
  const kind = provider(item.provider);
  return {
    id: cleanId(item.id), name: cleanText(item.name, '服务名称', 100), provider: kind,
    baseUrl: cleanBaseUrl(item.baseUrl, kind), model: cleanText(item.model, '模型名称', 200),
    temperature: cleanNumber(item.temperature, '温度', 0, 2, 0.1),
    maxOutputTokens: Math.round(cleanNumber(item.maxOutputTokens, '最大输出 Token', 1, 128_000, 8_000)),
    timeoutSeconds: Math.round(cleanNumber(item.timeoutSeconds, '超时', 5, 600, 180)),
    supportsVision: item.supportsVision === true,
    inputPricePerMillion: cleanPrice(item.inputPricePerMillion, '输入价格'),
    outputPricePerMillion: cleanPrice(item.outputPricePerMillion, '输出价格'),
    encryptedApiKey: typeof item.encryptedApiKey === 'string' ? item.encryptedApiKey : '',
    keyHint: typeof item.keyHint === 'string' ? item.keyHint.slice(-4) : '',
  };
}

function migrateV1(value: StoredSettingsV1): StoredSettingsV2 {
  const fallback = PRESETS.deepseek;
  const kind = value.provider === 'anthropic' ? 'anthropic' : 'openai-compatible';
  const service = normalizeService({
    id: randomUUID(), name: kind === 'anthropic' ? 'Anthropic' : '我的服务', provider: kind,
    baseUrl: value.baseUrl ?? fallback.baseUrl, model: value.model ?? fallback.model,
    temperature: 0.1, maxOutputTokens: 8_000, timeoutSeconds: 180, supportsVision: false,
    inputPricePerMillion: value.inputPricePerMillion, outputPricePerMillion: value.outputPricePerMillion,
    encryptedApiKey: value.encryptedApiKey ?? '', keyHint: value.keyHint ?? '',
  });
  return { version: 2, activeServiceId: service.id, services: [service] };
}

function normalizeStored(value: unknown): StoredSettingsV2 {
  if (!value || typeof value !== 'object') return defaultSettings();
  const candidate = value as Partial<StoredSettingsV2> & StoredSettingsV1;
  if (candidate.version !== 2 || !Array.isArray(candidate.services)) return migrateV1(candidate);
  try {
    const services = candidate.services.slice(0, 30).map(normalizeService);
    if (!services.length) return defaultSettings();
    const activeServiceId = services.some((item) => item.id === candidate.activeServiceId) ? candidate.activeServiceId as string : services[0].id;
    return { version: 2, activeServiceId, services };
  } catch { return defaultSettings(); }
}

async function readStored(): Promise<StoredSettingsV2> {
  try { return normalizeStored(JSON.parse(await readFile(settingsPath(), 'utf8'))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultSettings();
    throw new Error('无法读取模型设置。');
  }
}

async function writeStored(settings: StoredSettingsV2): Promise<void> {
  await mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeFileAtomic(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function publicService(service: StoredService): AiServiceSettings {
  const { encryptedApiKey, ...rest } = service;
  void encryptedApiKey;
  return { ...rest, keyConfigured: Boolean(service.encryptedApiKey) };
}

function toPublic(stored: StoredSettingsV2): AiSettings {
  const services = stored.services.map(publicService);
  const active = services.find((item) => item.id === stored.activeServiceId) ?? services[0];
  return { ...active, activeServiceId: active.id, services, encryptionAvailable: safeStorage.isEncryptionAvailable() };
}

function serviceIndex(settings: StoredSettingsV2, serviceId: unknown): number {
  const id = serviceId ? cleanId(serviceId) : settings.activeServiceId;
  const index = settings.services.findIndex((service) => service.id === id);
  if (index < 0) throw new Error('模型服务不存在。');
  return index;
}

export async function getAiSettings(): Promise<AiSettings> {
  return toPublic(await readStored());
}

export async function saveAiSettings(request: SaveAiSettingsRequest): Promise<AiSettings> {
  if (!request || typeof request !== 'object') throw new Error('模型设置格式无效。');
  const stored = await readStored();
  const index = serviceIndex(stored, request.serviceId);
  const current = stored.services[index];
  const kind = provider(request.provider);
  let encryptedApiKey = request.clearKey ? '' : current.encryptedApiKey;
  let keyHint = request.clearKey ? '' : current.keyHint;
  if (typeof request.apiKey === 'string' && request.apiKey.trim()) {
    const apiKey = cleanText(request.apiKey, 'API Key', 16_000);
    if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS 安全存储当前不可用，API Key 未保存。');
    encryptedApiKey = safeStorage.encryptString(apiKey).toString('base64');
    keyHint = apiKey.slice(-4);
  }
  stored.services[index] = normalizeService({
    ...current,
    name: request.name ?? current.name,
    provider: kind,
    baseUrl: cleanBaseUrl(request.baseUrl, kind),
    model: request.model,
    temperature: request.temperature,
    maxOutputTokens: request.maxOutputTokens,
    timeoutSeconds: request.timeoutSeconds,
    supportsVision: request.supportsVision,
    inputPricePerMillion: request.inputPricePerMillion,
    outputPricePerMillion: request.outputPricePerMillion,
    encryptedApiKey,
    keyHint,
  });
  stored.activeServiceId = stored.services[index].id;
  await writeStored(stored);
  return toPublic(stored);
}

export async function createAiService(preset: AiServicePreset): Promise<AiSettings> {
  if (!(preset in PRESETS)) throw new Error('模型服务预设无效。');
  const stored = await readStored();
  if (stored.services.length >= 30) throw new Error('最多只能保存 30 个模型服务。');
  const service = makeService(preset);
  const duplicateCount = stored.services.filter((item) => item.name === service.name).length;
  if (duplicateCount) service.name = `${service.name} ${duplicateCount + 1}`;
  stored.services.push(service);
  stored.activeServiceId = service.id;
  await writeStored(stored);
  return toPublic(stored);
}

export async function selectAiService(serviceId: string): Promise<AiSettings> {
  const stored = await readStored();
  stored.activeServiceId = stored.services[serviceIndex(stored, serviceId)].id;
  await writeStored(stored);
  return toPublic(stored);
}

export async function deleteAiService(serviceId: string): Promise<AiSettings> {
  const stored = await readStored();
  if (stored.services.length === 1) throw new Error('至少保留一个模型服务。');
  const index = serviceIndex(stored, serviceId);
  stored.services.splice(index, 1);
  if (stored.activeServiceId === serviceId) stored.activeServiceId = stored.services[0].id;
  await writeStored(stored);
  return toPublic(stored);
}

function decryptKey(service: StoredService, draftKey?: string): string {
  if (draftKey?.trim()) return cleanText(draftKey, 'API Key', 16_000);
  if (!service.encryptedApiKey) throw new Error('请先输入或保存 API Key。');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS 安全存储当前不可用。');
  try { return safeStorage.decryptString(Buffer.from(service.encryptedApiKey, 'base64')); }
  catch { throw new Error('API Key 无法解密，请重新保存。'); }
}

function modelsEndpoint(baseUrl: string, kind: AiProviderKind): string {
  const base = `${cleanBaseUrl(baseUrl, kind).replace(/\/$/, '')}/`;
  return new URL(kind === 'anthropic' ? 'v1/models' : 'models', base).toString();
}

async function fetchModels(request: AiModelsRequest): Promise<AiModelsResult> {
  if (!request || typeof request !== 'object') throw new Error('模型列表请求无效。');
  const stored = await readStored();
  const service = stored.services[serviceIndex(stored, request.serviceId)];
  const kind = provider(request.provider);
  const apiKey = decryptKey(service, request.apiKey);
  const endpoint = modelsEndpoint(request.baseUrl, kind);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), service.timeoutSeconds * 1_000);
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (kind === 'anthropic') { headers['x-api-key'] = apiKey; headers['anthropic-version'] = '2023-06-01'; }
    else headers.authorization = `Bearer ${apiKey}`;
    const response = await fetch(endpoint, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`模型服务返回 HTTP ${response.status}：${(await response.text()).slice(0, 500)}`);
    const json = await response.json() as { data?: Array<{ id?: unknown }> };
    const models = [...new Set((json.data ?? []).map((item) => typeof item.id === 'string' ? item.id.trim() : '').filter(Boolean))].sort();
    return { models: models.slice(0, 1_000), endpoint };
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new Error(`连接在 ${service.timeoutSeconds} 秒后超时。`);
    throw error;
  } finally { clearTimeout(timer); }
}

export async function listAiModels(request: AiModelsRequest): Promise<AiModelsResult> {
  return fetchModels(request);
}

export async function testAiConnection(request: AiModelsRequest): Promise<AiConnectionTestResult> {
  const startedAt = Date.now();
  try {
    const result = await fetchModels(request);
    return { ok: true, message: result.models.length ? `连接成功，读取到 ${result.models.length} 个模型。` : '连接成功，但服务没有返回模型列表。', latencyMs: Date.now() - startedAt, modelCount: result.models.length };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '连接测试失败。', latencyMs: Date.now() - startedAt, modelCount: 0 };
  }
}

export async function getAiCredentials(): Promise<AiCredentials> {
  const stored = await readStored();
  const service = stored.services[serviceIndex(stored, stored.activeServiceId)];
  return {
    id: service.id, name: service.name, provider: service.provider, baseUrl: service.baseUrl,
    model: service.model, temperature: service.temperature, maxOutputTokens: service.maxOutputTokens,
    timeoutSeconds: service.timeoutSeconds, supportsVision: service.supportsVision,
    inputPricePerMillion: service.inputPricePerMillion, outputPricePerMillion: service.outputPricePerMillion,
    apiKey: decryptKey(service),
  };
}
