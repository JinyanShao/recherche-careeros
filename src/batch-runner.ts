import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import type {
  BatchJob,
  BatchOptions,
  BatchRunStatus,
  HighScoreMatch,
  PipelineJob,
} from './contracts';
import { loadCareerOpsSnapshot } from './career-ops-reader';
import { runJobEvaluation } from './job-evaluation-runner';
import { runCareerOpsNodeScript } from './career-ops-adapter';

const INPUT_HEADER = 'id\turl\tsource\tnotes\n';
const STATE_HEADER = 'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries\n';
const MAX_LOG_LINES = 600;
const MAX_BATCH_JOBS = 5_000;
let currentRun: BatchRunStatus = idleStatus();
let cancellationRequested = false;
let runPromise: Promise<void> | null = null;
let stateWriteChain: Promise<void> = Promise.resolve();

type BatchCallbacks = {
  onHighMatch?: (match: HighScoreMatch) => void;
};

function idleStatus(): BatchRunStatus {
  return {
    id: '', state: 'idle', startedAt: null, endedAt: null, active: 0,
    queued: 0, completed: 0, failed: 0, total: 0, options: null,
    logs: [], error: '', highMatches: [],
  };
}

function cleanCell(value: unknown): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 2_000) || '-';
}

function readTsv(content: string): Array<Record<string, string>> {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const values = line.split('\t');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

async function readOptional(file: string): Promise<string> {
  try { return await readFile(file, 'utf8'); } catch { return ''; }
}

function validateOptions(value: BatchOptions): BatchOptions {
  if (!value || typeof value !== 'object') throw new Error('批量任务设置无效。');
  const integer = (candidate: number, minimum: number, maximum: number, label: string): number => {
    if (!Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
      throw new Error(`${label}必须是 ${minimum}–${maximum} 的整数。`);
    }
    return candidate;
  };
  if (!Number.isFinite(value.notifyScore) || value.notifyScore < 1 || value.notifyScore > 5) {
    throw new Error('高分通知阈值必须是 1–5。');
  }
  return {
    concurrency: integer(value.concurrency, 1, 6, '并发数'),
    maxRetries: integer(value.maxRetries, 0, 5, '失败重试次数'),
    retryDelaySeconds: integer(value.retryDelaySeconds, 0, 300, '重试等待时间'),
    limit: integer(value.limit, 0, 1_000, '本次任务上限'),
    notifyScore: Math.round(value.notifyScore * 10) / 10,
    retryFailed: value.retryFailed === true,
    resumeIncomplete: value.resumeIncomplete === true,
  };
}

function stateJob(row: Record<string, string>, identity?: PipelineJob): BatchJob {
  const score = Number(row.score);
  const statuses = new Set<BatchJob['status']>([
    'pending', 'processing', 'completed', 'failed', 'skipped', 'rate_limited', 'paused_rate_limit',
  ]);
  const status = statuses.has(row.status as BatchJob['status']) ? row.status as BatchJob['status'] : 'pending';
  return {
    id: Number(row.id) || 0,
    url: row.url,
    company: identity?.company ?? '',
    role: identity?.role ?? '',
    status,
    startedAt: row.started_at === '-' ? '' : row.started_at,
    completedAt: row.completed_at === '-' ? '' : row.completed_at,
    reportNumber: row.report_num === '-' ? '' : row.report_num,
    score: Number.isFinite(score) ? score : null,
    error: row.error === '-' ? '' : row.error,
    retries: Number(row.retries) || 0,
  };
}

function serializeState(jobs: Iterable<BatchJob>): string {
  const rows = [...jobs].sort((a, b) => a.id - b.id).map((job) => [
    job.id, job.url, job.status, job.startedAt || '-', job.completedAt || '-',
    job.reportNumber || '-', job.score ?? '-', cleanCell(job.error), job.retries,
  ].join('\t'));
  return `${STATE_HEADER}${rows.length ? `${rows.join('\n')}\n` : ''}`;
}

async function writeState(root: string, jobs: Map<number, BatchJob>): Promise<void> {
  const content = serializeState(jobs.values());
  const statePath = path.join(root, 'batch', 'batch-state.tsv');
  stateWriteChain = stateWriteChain.then(() => writeFileAtomic(statePath, content, { encoding: 'utf8', mode: 0o600 }));
  return stateWriteChain;
}

async function seedPipelineInput(root: string): Promise<{ jobs: Map<number, BatchJob>; pipelineJobs: PipelineJob[] }> {
  const snapshot = loadCareerOpsSnapshot(root);
  const pending = snapshot.pipeline.jobs.filter((job) => !job.done);
  const batchDirectory = path.join(root, 'batch');
  await mkdir(batchDirectory, { recursive: true });
  const inputPath = path.join(batchDirectory, 'batch-input.tsv');
  const statePath = path.join(batchDirectory, 'batch-state.tsv');
  const [inputText, stateText] = await Promise.all([readOptional(inputPath), readOptional(statePath)]);
  const inputRows = readTsv(inputText);
  const byUrl = new Map(inputRows.map((row) => [row.url, row]));
  let nextId = Math.max(0, ...inputRows.map((row) => Number(row.id) || 0)) + 1;
  for (const job of pending) {
    if (byUrl.has(job.url)) continue;
    const row = { id: String(nextId), url: job.url, source: 'desktop-pipeline', notes: `${job.company} | ${job.role}` };
    inputRows.push(row);
    byUrl.set(job.url, row);
    nextId += 1;
  }
  if (inputRows.length > MAX_BATCH_JOBS) throw new Error('Batch 输入超过 5,000 条，已停止。');
  const inputContent = `${INPUT_HEADER}${inputRows.map((row) => [row.id, row.url, row.source || 'desktop-pipeline', cleanCell(row.notes)].join('\t')).join('\n')}${inputRows.length ? '\n' : ''}`;
  await writeFileAtomic(inputPath, inputContent, { encoding: 'utf8', mode: 0o600 });

  const identityByUrl = new Map(snapshot.pipeline.jobs.map((job) => [job.url, job]));
  const stateRows = readTsv(stateText);
  const stateById = new Map(stateRows.map((row) => [Number(row.id), row]));
  const jobs = new Map<number, BatchJob>();
  for (const row of inputRows) {
    const id = Number(row.id);
    if (!Number.isInteger(id) || id < 1) continue;
    const state = stateById.get(id) ?? {
      id: row.id, url: row.url, status: 'pending', started_at: '-', completed_at: '-',
      report_num: '-', score: '-', error: '-', retries: '0',
    };
    jobs.set(id, stateJob(state, identityByUrl.get(row.url)));
  }
  await writeState(root, jobs);
  return { jobs, pipelineJobs: pending };
}

async function loadBatchJobs(root: string): Promise<BatchJob[]> {
  const snapshot = loadCareerOpsSnapshot(root);
  const identityByUrl = new Map(snapshot.pipeline.jobs.map((job) => [job.url, job]));
  const [inputText, stateText] = await Promise.all([
    readOptional(path.join(root, 'batch', 'batch-input.tsv')),
    readOptional(path.join(root, 'batch', 'batch-state.tsv')),
  ]);
  const inputById = new Map(readTsv(inputText).map((row) => [Number(row.id), row]));
  return readTsv(stateText).map((row) => {
    const input = inputById.get(Number(row.id));
    return stateJob(row, identityByUrl.get(row.url || input?.url || ''));
  }).sort((a, b) => b.id - a.id);
}

async function appendLog(root: string, message: string, jobId?: number): Promise<void> {
  const timestamped = `${new Date().toISOString()}\t${cleanCell(message)}`;
  currentRun.logs = [...currentRun.logs, timestamped].slice(-MAX_LOG_LINES);
  const directory = path.join(root, 'data', 'automation');
  await mkdir(directory, { recursive: true });
  await appendFile(path.join(directory, 'batch.log'), `${timestamped}\n`, { encoding: 'utf8' });
  if (jobId) {
    const logs = path.join(root, 'batch', 'logs');
    await mkdir(logs, { recursive: true });
    await appendFile(path.join(logs, `${jobId}-desktop.log`), `${timestamped}\n`, { encoding: 'utf8' });
  }
}

async function waitForRetry(seconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < seconds * 4 && !cancellationRequested; elapsed += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function acquireRunLock(root: string): Promise<() => Promise<void>> {
  const batchDir = path.join(root, 'batch');
  await mkdir(batchDir, { recursive: true });
  const shellLock = path.join(batchDir, 'batch-runner.pid');
  const shellPid = Number((await readOptional(shellLock)).trim());
  if (shellPid) {
    try { process.kill(shellPid, 0); throw new Error(`career-ops batch-runner.sh 正在运行（PID ${shellPid}）。`); } catch (error) {
      if (error instanceof Error && error.message.includes('正在运行')) throw error;
    }
  }
  const lock = path.join(batchDir, 'desktop-batch.pid');
  try {
    const handle = await open(lock, 'wx', 0o600);
    await handle.writeFile(`${process.pid}\n`);
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const previousPid = Number((await readOptional(lock)).trim());
    if (previousPid) {
      try { process.kill(previousPid, 0); throw new Error(`另一个 Recherche CareerOS 批量任务正在运行（PID ${previousPid}）。`); } catch (candidate) {
        if (candidate instanceof Error && candidate.message.includes('正在运行')) throw candidate;
      }
    }
    await unlink(lock).catch((): undefined => undefined);
    return acquireRunLock(root);
  }
  return () => unlink(lock).catch((): undefined => undefined);
}

function selectJobs(jobs: Map<number, BatchJob>, pendingUrls: Set<string>, options: BatchOptions): BatchJob[] {
  const selected = [...jobs.values()].filter((job) => {
    if (!pendingUrls.has(job.url)) return false;
    if (options.retryFailed) return job.status === 'failed';
    if (options.resumeIncomplete) return ['processing', 'rate_limited', 'paused_rate_limit', 'pending', 'failed'].includes(job.status);
    return job.status === 'pending' || (job.status === 'failed' && job.retries <= options.maxRetries);
  }).sort((a, b) => a.id - b.id);
  return options.limit > 0 ? selected.slice(0, options.limit) : selected;
}

async function finalizeCareerOps(root: string): Promise<void> {
  for (const script of ['merge-tracker.mjs', 'reconcile-pipeline.mjs', 'verify-pipeline.mjs']) {
    try {
      const run = await runCareerOpsNodeScript(root, script, []);
      await appendLog(root, `${script}: ${run.code === 0 ? 'completed' : `exit ${run.code}`}`);
    } catch (error) {
      await appendLog(root, `${script}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }
}

async function executeBatch(
  root: string,
  jobs: Map<number, BatchJob>,
  selected: BatchJob[],
  options: BatchOptions,
  callbacks: BatchCallbacks,
  releaseLock: () => Promise<void>,
): Promise<void> {
  let cursor = 0;
  try {
    const worker = async (): Promise<void> => {
      while (!cancellationRequested) {
        const index = cursor;
        cursor += 1;
        if (index >= selected.length) return;
        const job = selected[index];
        currentRun.queued = Math.max(0, currentRun.queued - 1);
        currentRun.active += 1;
        job.status = 'processing';
        job.startedAt = new Date().toISOString();
        job.completedAt = '';
        job.error = '';
        await writeState(root, jobs);
        await appendLog(root, `#${job.id} started: ${job.company || job.url} — ${job.role}`, job.id);

        let succeeded = false;
        for (let attempt = job.retries; attempt <= options.maxRetries && !cancellationRequested; attempt += 1) {
          job.retries = attempt;
          const result = await runJobEvaluation(root, { inputKind: 'url', input: job.url });
          if (result.ok === true) {
            const evaluation = result.evaluation;
            job.status = 'completed';
            job.completedAt = new Date().toISOString();
            job.reportNumber = evaluation.reportName.match(/^\d+/)?.[0] ?? '';
            job.score = evaluation.score;
            job.error = evaluation.errors.join(' | ');
            currentRun.completed += 1;
            succeeded = true;
            await appendLog(root, `#${job.id} completed: ${evaluation.score.toFixed(1)}/5 · ${evaluation.reportName}`, job.id);
            if (evaluation.score >= options.notifyScore) {
              const match = { company: evaluation.company, role: evaluation.role, score: evaluation.score, reportName: evaluation.reportName };
              currentRun.highMatches = [...currentRun.highMatches, match];
              callbacks.onHighMatch?.(match);
            }
            break;
          }
          job.error = `${result.error.stage}/${result.error.code}: ${result.error.message}`;
          await appendLog(root, `#${job.id} attempt ${attempt + 1} failed: ${job.error}`, job.id);
          if (attempt < options.maxRetries && !cancellationRequested) {
            await appendLog(root, `#${job.id} retrying in ${options.retryDelaySeconds}s`, job.id);
            await waitForRetry(options.retryDelaySeconds);
          }
        }
        if (!succeeded) {
          if (cancellationRequested) {
            job.status = 'pending';
            job.error = job.error || '任务取消，等待恢复。';
          } else {
            job.status = 'failed';
            job.completedAt = new Date().toISOString();
            currentRun.failed += 1;
          }
        }
        currentRun.active = Math.max(0, currentRun.active - 1);
        await writeState(root, jobs);
      }
    };
    await Promise.all(Array.from({ length: Math.min(options.concurrency, selected.length) }, () => worker()));
    await finalizeCareerOps(root);
    currentRun = {
      ...currentRun,
      state: cancellationRequested ? 'cancelled' : currentRun.failed > 0 && currentRun.completed === 0 ? 'failed' : 'completed',
      endedAt: new Date().toISOString(), active: 0, queued: cancellationRequested ? currentRun.queued : 0,
      error: currentRun.failed > 0 ? `${currentRun.failed} 个岗位评分失败。` : '',
    };
    await appendLog(root, cancellationRequested ? 'Batch cancelled; incomplete jobs remain resumable.' : 'Batch completed.');
  } catch (error) {
    currentRun = { ...currentRun, state: 'failed', endedAt: new Date().toISOString(), active: 0, error: error instanceof Error ? error.message : '批量任务失败。' };
    await appendLog(root, `Batch failed: ${currentRun.error}`);
  } finally {
    await releaseLock();
    runPromise = null;
    cancellationRequested = false;
  }
}

export function getBatchStatus(): BatchRunStatus {
  return structuredClone(currentRun);
}

export async function getBatchJobs(root: string): Promise<BatchJob[]> {
  return loadBatchJobs(root);
}

export async function synchronizeBatchJobs(root: string): Promise<BatchJob[]> {
  const { jobs } = await seedPipelineInput(root);
  return [...jobs.values()].sort((a, b) => b.id - a.id);
}

export async function getRecentBatchLog(root: string): Promise<string[]> {
  const content = await readOptional(path.join(root, 'data', 'automation', 'batch.log'));
  return content.split(/\r?\n/).filter(Boolean).slice(-300);
}

export async function startBatch(root: string, rawOptions: BatchOptions, callbacks: BatchCallbacks = {}): Promise<BatchRunStatus> {
  if (runPromise || ['running', 'cancelling'].includes(currentRun.state)) throw new Error('已有批量评分任务正在运行。');
  const options = validateOptions(rawOptions);
  const releaseLock = await acquireRunLock(root);
  try {
    const { jobs, pipelineJobs } = await seedPipelineInput(root);
    const selected = selectJobs(jobs, new Set(pipelineJobs.map((job) => job.url)), options);
    if (!selected.length) {
      await releaseLock();
      currentRun = { ...idleStatus(), state: 'completed', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), options, logs: ['没有符合当前模式的待处理岗位。'] };
      return getBatchStatus();
    }
    cancellationRequested = false;
    currentRun = {
      id: randomUUID(), state: 'running', startedAt: new Date().toISOString(), endedAt: null,
      active: 0, queued: selected.length, completed: 0, failed: 0, total: selected.length,
      options, logs: [], error: '', highMatches: [],
    };
    await appendLog(root, `Batch started: ${selected.length} jobs, concurrency ${options.concurrency}, max retries ${options.maxRetries}.`);
    runPromise = executeBatch(root, jobs, selected, options, callbacks, releaseLock);
    return getBatchStatus();
  } catch (error) {
    await releaseLock();
    throw error;
  }
}

export function cancelBatch(): BatchRunStatus {
  if (!runPromise || currentRun.state !== 'running') return getBatchStatus();
  cancellationRequested = true;
  currentRun = { ...currentRun, state: 'cancelling', logs: [...currentRun.logs, `${new Date().toISOString()}\t停止请求已记录；正在完成当前请求。`].slice(-MAX_LOG_LINES) };
  return getBatchStatus();
}

export async function waitForBatchCompletion(): Promise<BatchRunStatus> {
  if (runPromise) await runPromise;
  return getBatchStatus();
}
