import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import writeFileAtomic from 'write-file-atomic';
import { parse, stringify } from 'yaml';
import type { BatchOptions, DailyAutomationConfig, SaveDailyAutomationRequest } from './contracts';

const execFileAsync = promisify(execFile);
const LABEL = 'io.recherche.career-ops.daily';
const BLOCK_START = '<!-- RECHERCHE_DAILY_AUTOMATION_START -->';
const BLOCK_END = '<!-- RECHERCHE_DAILY_AUTOMATION_END -->';
const DEFAULT_OPTIONS: BatchOptions = {
  concurrency: 2,
  maxRetries: 2,
  retryDelaySeconds: 15,
  limit: 20,
  notifyScore: 4,
  retryFailed: false,
  resumeIncomplete: true,
};

type StoredAutomation = {
  enabled: boolean;
  hour: number;
  minute: number;
  options: BatchOptions;
  updated_at: string;
};

function automationDirectory(root: string): string {
  return path.join(root, 'data', 'automation');
}

function launchAgentsDirectory(): string {
  return process.env.RECHERCHE_LAUNCH_AGENTS_DIR?.trim()
    || path.join(os.homedir(), 'Library', 'LaunchAgents');
}

function plistPath(): string {
  return path.join(launchAgentsDirectory(), `${LABEL}.plist`);
}

function customPath(root: string): string {
  return path.join(root, 'modes', '_custom.md');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function readOptional(file: string): Promise<string> {
  try { return await readFile(file, 'utf8'); } catch { return ''; }
}

function managedBlock(data: StoredAutomation): string {
  const yaml = stringify({
    enabled: data.enabled,
    schedule: { hour: data.hour, minute: data.minute },
    batch: data.options,
    updated_at: data.updated_at,
  }, { lineWidth: 0 }).trimEnd();
  return `${BLOCK_START}\n## Recherche CareerOS daily batch automation\n\n\`\`\`yaml\n${yaml}\n\`\`\`\n${BLOCK_END}`;
}

function readManaged(content: string): StoredAutomation | null {
  const start = content.indexOf(BLOCK_START);
  const end = content.indexOf(BLOCK_END);
  if (start < 0 || end <= start) return null;
  const block = content.slice(start, end);
  const yaml = block.match(/```yaml\s*\n([\s\S]*?)\n```/)?.[1];
  if (!yaml) return null;
  try {
    const value = parse(yaml) as Record<string, unknown>;
    const schedule = value.schedule as Record<string, unknown> | undefined;
    return {
      enabled: value.enabled === true,
      hour: Number(schedule?.hour ?? 9),
      minute: Number(schedule?.minute ?? 0),
      options: { ...DEFAULT_OPTIONS, ...((value.batch as Partial<BatchOptions>) ?? {}) },
      updated_at: String(value.updated_at ?? ''),
    };
  } catch {
    return null;
  }
}

function replaceManaged(content: string, block: string): string {
  const start = content.indexOf(BLOCK_START);
  const end = content.indexOf(BLOCK_END);
  if (start >= 0 && end > start) {
    return `${content.slice(0, start).trimEnd()}\n\n${block}\n${content.slice(end + BLOCK_END.length).trimStart()}`;
  }
  return `${content.trimEnd()}${content.trim() ? '\n\n' : ''}${block}\n`;
}

function revisionFor(custom: string, plist: string): string {
  return createHash('sha256').update(custom).update('\0').update(plist).digest('hex');
}

function validateRequest(request: SaveDailyAutomationRequest): StoredAutomation {
  if (!request || typeof request !== 'object') throw new Error('每日自动化设置无效。');
  if (!Number.isInteger(request.hour) || request.hour < 0 || request.hour > 23) throw new Error('运行小时必须是 0–23。');
  if (!Number.isInteger(request.minute) || request.minute < 0 || request.minute > 59) throw new Error('运行分钟必须是 0–59。');
  const options = request.options;
  if (!options || !Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 6) throw new Error('并发数必须是 1–6。');
  if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0 || options.maxRetries > 5) throw new Error('重试次数必须是 0–5。');
  if (!Number.isInteger(options.retryDelaySeconds) || options.retryDelaySeconds < 0 || options.retryDelaySeconds > 300) throw new Error('重试等待必须是 0–300 秒。');
  if (!Number.isInteger(options.limit) || options.limit < 0 || options.limit > 1_000) throw new Error('每日上限必须是 0–1,000。');
  if (!Number.isFinite(options.notifyScore) || options.notifyScore < 1 || options.notifyScore > 5) throw new Error('通知阈值必须是 1–5。');
  return { enabled: request.enabled === true, hour: request.hour, minute: request.minute, options: { ...options }, updated_at: new Date().toISOString() };
}

function launchExecutable(): string {
  return process.env.RECHERCHE_EXECUTABLE_PATH?.trim() || process.execPath;
}

function plist(root: string, data: StoredAutomation): string {
  const logs = automationDirectory(root);
  const args = [launchExecutable(), '--recherche-daily-batch', '--career-ops-root', root];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>${args.map((arg) => `\n    <string>${escapeXml(arg)}</string>`).join('')}\n  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${data.hour}</integer><key>Minute</key><integer>${data.minute}</integer></dict>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${escapeXml(path.join(logs, 'launch-agent.stdout.log'))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(path.join(logs, 'launch-agent.stderr.log'))}</string>
</dict>
</plist>
`;
}

async function launchctl(action: 'bootstrap' | 'bootout', file: string): Promise<void> {
  if (process.platform !== 'darwin' && !process.env.RECHERCHE_LAUNCHCTL_PATH) return;
  const executable = process.env.RECHERCHE_LAUNCHCTL_PATH?.trim() || '/bin/launchctl';
  const domain = `gui/${process.getuid?.() ?? 0}`;
  const args = action === 'bootstrap' ? [action, domain, file] : [action, domain, file];
  try {
    await execFileAsync(executable, args, { timeout: 15_000 });
  } catch (error) {
    const candidate = error as { stderr?: string; message?: string };
    if (action === 'bootout' && /not found|no such process|could not find/i.test(candidate.stderr || candidate.message || '')) return;
    throw new Error(`LaunchAgent ${action} 失败：${candidate.stderr?.trim() || candidate.message || 'unknown error'}`);
  }
}

function nextRun(hour: number, minute: number, enabled: boolean): string | null {
  if (!enabled) return null;
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export async function loadDailyAutomation(root: string): Promise<DailyAutomationConfig> {
  const [custom, existingPlist] = await Promise.all([readOptional(customPath(root)), readOptional(plistPath())]);
  const stored = readManaged(custom) ?? { enabled: false, hour: 9, minute: 0, options: DEFAULT_OPTIONS, updated_at: '' };
  return {
    revision: revisionFor(custom, existingPlist), enabled: stored.enabled, hour: stored.hour, minute: stored.minute,
    options: { ...DEFAULT_OPTIONS, ...stored.options }, installed: existingPlist.includes(`<string>${LABEL}</string>`),
    label: LABEL, plistPath: plistPath(), stdoutPath: path.join(automationDirectory(root), 'launch-agent.stdout.log'),
    stderrPath: path.join(automationDirectory(root), 'launch-agent.stderr.log'), nextRunAt: nextRun(stored.hour, stored.minute, stored.enabled),
    updatedAt: stored.updated_at || null,
  };
}

export async function saveDailyAutomation(root: string, request: SaveDailyAutomationRequest): Promise<DailyAutomationConfig> {
  const before = await loadDailyAutomation(root);
  if (!request.expectedRevision || request.expectedRevision !== before.revision) throw new Error('每日自动化设置已被其他进程修改，请重新读取后再保存。');
  const data = validateRequest(request);
  const customFile = customPath(root);
  const targetPlist = plistPath();
  const [custom, oldPlist] = await Promise.all([readOptional(customFile), readOptional(targetPlist)]);
  const backup = path.join(automationDirectory(root), 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
  await Promise.all([mkdir(path.dirname(customFile), { recursive: true }), mkdir(path.dirname(targetPlist), { recursive: true }), mkdir(backup, { recursive: true })]);
  await Promise.all([
    writeFile(path.join(backup, '_custom.md'), custom, { encoding: 'utf8', mode: 0o600 }),
    writeFile(path.join(backup, `${LABEL}.plist`), oldPlist, { encoding: 'utf8', mode: 0o600 }),
  ]);
  await writeFileAtomic(customFile, replaceManaged(custom, managedBlock(data)), { encoding: 'utf8', mode: 0o600 });
  await launchctl('bootout', targetPlist);
  if (data.enabled) {
    await mkdir(automationDirectory(root), { recursive: true });
    await writeFileAtomic(targetPlist, plist(root, data), { encoding: 'utf8', mode: 0o600 });
    await access(launchExecutable());
    await launchctl('bootstrap', targetPlist);
  } else {
    await unlink(targetPlist).catch((error: NodeJS.ErrnoException): void => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  return loadDailyAutomation(root);
}
