import { randomUUID } from 'node:crypto';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ScanRequest, ScanRunStatus } from './contracts';
import { spawnCareerOpsNodeScript } from './career-ops-adapter';

const ATS = new Set(['greenhouse', 'lever', 'ashby', 'workday', 'icims']);
const MAX_LOG_LINES = 500;
let child: ChildProcessWithoutNullStreams | null = null;
let status: ScanRunStatus = idleStatus();

function idleStatus(): ScanRunStatus {
  return {
    id: '', kind: null, state: 'idle', startedAt: null, endedAt: null,
    exitCode: null, commandLabel: '', logs: [], error: '', result: null,
  };
}

function iso(value: string): string {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error('发布日期必须使用 YYYY-MM-DD。');
  }
  return value;
}

function buildArgs(request: ScanRequest): { script: 'scan.mjs' | 'scan-ats-full.mjs'; args: string[]; label: string } {
  if (!request || typeof request !== 'object') throw new Error('扫描请求格式无效。');
  if (request.kind === 'quick') {
    const args: string[] = ['--quiet'];
    if (request.dryRun) args.push('--dry-run');
    if (request.verify) args.push('--verify');
    const company = typeof request.company === 'string' ? request.company.trim() : '';
    if (company) {
      if (company.length > 200 || company.includes('\u0000')) throw new Error('公司筛选无效。');
      args.push('--company', company);
    }
    const after = iso(request.postedAfter);
    const before = iso(request.postedBefore);
    if (after) args.push('--posted-after', after);
    if (before) args.push('--posted-before', before);
    if (after && before && after > before) throw new Error('开始日期不能晚于结束日期。');
    return { script: 'scan.mjs', args, label: company ? `快速扫描 · ${company}` : '快速扫描 · 已启用 Portal' };
  }
  if (request.kind !== 'full') throw new Error('扫描类型无效。');
  if (!Number.isInteger(request.sinceDays) || request.sinceDays < 1 || request.sinceDays > 365) {
    throw new Error('全量扫描时间范围必须是 1–365 天。');
  }
  if (!Array.isArray(request.ats) || !request.ats.length || request.ats.some((item) => !ATS.has(item))) {
    throw new Error('请选择有效的 ATS Provider。');
  }
  const args = ['--json', '--since', String(request.sinceDays), '--ats', request.ats.join(',')];
  if (request.limit !== null) {
    if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100_000) {
      throw new Error('公司扫描上限必须是 1–100000。');
    }
    args.push('--limit', String(request.limit));
  }
  if (request.dryRun) args.push('--dry-run');
  if (request.liveness) args.push('--liveness');
  if (request.resume) args.push('--resume');
  if (request.includeUndated) args.push('--include-undated');
  return { script: 'scan-ats-full.mjs', args, label: `全量反向扫描 · ${request.ats.join(' / ')}` };
}

function appendLogs(chunk: string, stream: 'out' | 'err'): void {
  const next = chunk.split(/\r?\n/).filter(Boolean).map((line) => `${stream === 'err' ? '!' : '›'} ${line}`);
  status.logs = [...status.logs, ...next].slice(-MAX_LOG_LINES);
}

export function getScanStatus(): ScanRunStatus {
  return structuredClone(status);
}

export async function startScan(root: string, request: ScanRequest): Promise<ScanRunStatus> {
  if (child || status.state === 'running') throw new Error('已有扫描正在运行。');
  const command = buildArgs(request);
  status = {
    id: randomUUID(), kind: request.kind, state: 'running',
    startedAt: new Date().toISOString(), endedAt: null, exitCode: null,
    commandLabel: command.label, logs: [], error: '', result: null,
  };
  child = await spawnCareerOpsNodeScript(root, command.script, command.args);
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout = `${stdout}${chunk}`.slice(-2_000_000); appendLogs(chunk, 'out'); });
  child.stderr.on('data', (chunk: string) => appendLogs(chunk, 'err'));
  child.on('error', (error) => {
    status = { ...status, state: 'failed', endedAt: new Date().toISOString(), error: error.message };
    child = null;
  });
  child.on('close', (code, signal) => {
    const cancelled = status.state === 'cancelled' || signal === 'SIGTERM' || signal === 'SIGKILL';
    let result: Record<string, unknown> | null = null;
    if (request.kind === 'full' && code === 0) {
      try { result = JSON.parse(stdout.trim()) as Record<string, unknown>; } catch { /* surfaced below */ }
    }
    status = {
      ...status,
      state: cancelled ? 'cancelled' : code === 0 ? 'completed' : 'failed',
      endedAt: new Date().toISOString(),
      exitCode: code,
      result,
      error: cancelled ? '' : code === 0 && request.kind === 'full' && !result
        ? '全量扫描完成，但没有返回有效 JSON。'
        : code === 0 ? '' : `扫描进程退出，代码 ${code ?? 'unknown'}。`,
    };
    child = null;
  });
  return getScanStatus();
}

export function cancelScan(): ScanRunStatus {
  if (!child || status.state !== 'running') return getScanStatus();
  status = { ...status, state: 'cancelled', endedAt: new Date().toISOString() };
  child.kill('SIGTERM');
  const pending = child;
  setTimeout(() => {
    if (child === pending && pending.exitCode === null) pending.kill('SIGKILL');
  }, 3_000).unref();
  return getScanStatus();
}
