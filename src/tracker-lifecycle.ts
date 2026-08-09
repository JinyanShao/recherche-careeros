import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadCareerOpsSnapshot } from './career-ops-reader';
import { runCareerOpsNodeScript, runCareerOpsReplyMatcher } from './career-ops-adapter';
import type {
  FollowupCadenceResult,
  InviteMatchResult,
  OutcomeRequest,
  ReplyDraft,
  ReplyRecommendation,
  TrackerMutationResult,
  TrackerStatusChangeRequest,
} from './contracts';

const CANONICAL_STATUSES = new Set([
  'Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Hired', 'Rejected', 'Discarded', 'SKIP',
]);

function parseJson<T>(stdout: string, script: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error(`${script} 没有返回有效的 JSON。`);
  }
}

function scriptFailure(script: string, stdout: string, stderr: string, code: number): never {
  const detail = stdout.trim() || stderr.trim() || `${script} 退出码 ${code}`;
  try {
    const parsed = JSON.parse(detail) as { error?: string };
    throw new Error(parsed.error || detail);
  } catch (error) {
    if (error instanceof Error && error.message !== 'Unexpected token') throw error;
    throw new Error(detail);
  }
}

function requireRowNumber(rowNumber: string): string {
  if (!/^\d+$/.test(rowNumber)) throw new Error('请选择有效的 Tracker 行号。');
  return rowNumber;
}

function optionalArgument(args: string[], flag: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) args.push(flag, trimmed);
}

async function currentFollowups(root: string): Promise<Array<{ appNum: number; contact: string; notes: string }>> {
  try {
    const content = await readFile(path.join(root, 'data', 'follow-ups.md'), 'utf8');
    return content.split(/\r?\n/).flatMap((line) => {
      if (!line.startsWith('|')) return [];
      const cells = line.split('|').map((cell) => cell.trim());
      const appNum = Number.parseInt(cells[2] ?? '', 10);
      if (!Number.isInteger(appNum)) return [];
      return [{ appNum, contact: cells[6] ?? '', notes: cells[7] ?? '' }];
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function updateTrackerStatus(root: string, request: TrackerStatusChangeRequest): Promise<TrackerMutationResult> {
  const rowNumber = requireRowNumber(request.rowNumber);
  if (!CANONICAL_STATUSES.has(request.status)) throw new Error('状态不是 career-ops 支持的规范状态。');
  const args = ['--row', rowNumber, request.status, '--json'];
  optionalArgument(args, '--note', request.note);
  optionalArgument(args, '--on', request.occurredOn);
  const result = await runCareerOpsNodeScript(root, 'set-status.mjs', args);
  if (result.code !== 0) scriptFailure('set-status.mjs', result.stdout, result.stderr, result.code);
  return {
    ok: true,
    message: `申请 #${rowNumber} 的状态已更新。`,
    detail: parseJson<Record<string, unknown>>(result.stdout, 'set-status.mjs'),
    snapshot: loadCareerOpsSnapshot(root),
  };
}

export async function seedFollowup(root: string, rowNumber: string): Promise<TrackerMutationResult> {
  const result = await runCareerOpsNodeScript(root, 'followup-seed.mjs', [requireRowNumber(rowNumber), '--json']);
  if (result.code !== 0) scriptFailure('followup-seed.mjs', result.stdout, result.stderr, result.code);
  return {
    ok: true,
    message: `已为申请 #${rowNumber} 建立跟进提醒。`,
    detail: parseJson<Record<string, unknown>>(result.stdout, 'followup-seed.mjs'),
    snapshot: loadCareerOpsSnapshot(root),
  };
}

export async function getFollowupCadence(root: string): Promise<FollowupCadenceResult> {
  const result = await runCareerOpsNodeScript(root, 'followup-cadence.mjs', []);
  if (result.code !== 0) scriptFailure('followup-cadence.mjs', result.stdout, result.stderr, result.code);
  return parseJson<FollowupCadenceResult>(result.stdout, 'followup-cadence.mjs');
}

export async function analyzeReply(root: string, reply: ReplyDraft): Promise<ReplyRecommendation> {
  if (!reply.subject.trim() && !reply.body.trim()) throw new Error('请至少填写邮件主题或正文。');
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'recherche-reply-'));
  const emailFile = path.join(tempDirectory, 'reply.txt');
  try {
    await writeFile(emailFile, `Subject: ${reply.subject.trim()}\nFrom: ${reply.from.trim()}\n\n${reply.body.trim()}\n`, { encoding: 'utf8', mode: 0o600 });
    const appended = await runCareerOpsNodeScript(root, 'paste-reply.mjs', ['--file', emailFile]);
    if (appended.code !== 0) scriptFailure('paste-reply.mjs', appended.stdout, appended.stderr, appended.code);
    const snapshot = loadCareerOpsSnapshot(root);
    const candidate: { message_id: string; from: string; subject: string; body_snippet: string; signal: null } = {
      message_id: `desktop-${Date.now()}`,
      from: reply.from.trim(),
      subject: reply.subject.trim(),
      body_snippet: reply.body.trim(),
      signal: null,
    };
    const output = await runCareerOpsReplyMatcher(root, {
      candidates: [candidate],
      applications: snapshot.tracker.applications.map((application) => ({
        num: Number(application.number), company: application.company, role: application.role, notes: application.notes,
      })),
      followups: await currentFollowups(root),
    });
    const [matched] = parseJson<Array<{
      candidate: typeof candidate;
      classification: { type: string; evidence: string[]; suggestedTrackerUpdate: string };
      match: { application_num: number | null; company_hint: string; role_hint: string; confidence: string; signals: string[] };
    }>>(output, 'reply-matcher.mjs');
    if (!matched) throw new Error('reply-matcher.mjs 未返回邮件建议。');
    const suggested = matched.classification.suggestedTrackerUpdate;
    return {
      candidate: { messageId: matched.candidate.message_id, from: matched.candidate.from, subject: matched.candidate.subject, body: matched.candidate.body_snippet },
      classification: matched.classification,
      match: {
        applicationNumber: matched.match?.application_num == null ? null : String(matched.match.application_num),
        companyHint: matched.match?.company_hint ?? '', roleHint: matched.match?.role_hint ?? '',
        confidence: matched.match?.confidence ?? 'low', signals: matched.match?.signals ?? [],
      },
      canApplySuggestedStatus: matched.match?.application_num != null && CANONICAL_STATUSES.has(suggested),
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

export async function matchInvite(root: string, inviteText: string): Promise<InviteMatchResult> {
  if (!inviteText.trim()) throw new Error('请粘贴面试邀请内容。');
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'recherche-invite-'));
  const inviteFile = path.join(tempDirectory, 'invite.txt');
  try {
    await writeFile(inviteFile, inviteText, { encoding: 'utf8', mode: 0o600 });
    const result = await runCareerOpsNodeScript(root, 'invite-match.mjs', ['--file', inviteFile]);
    if (result.code !== 0) scriptFailure('invite-match.mjs', result.stdout, result.stderr, result.code);
    return parseJson<InviteMatchResult>(result.stdout, 'invite-match.mjs');
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

export async function recordOutcome(root: string, request: OutcomeRequest): Promise<TrackerMutationResult> {
  const args = [requireRowNumber(request.rowNumber), request.outcomeType, '--json'];
  optionalArgument(args, '--stage', request.stage);
  optionalArgument(args, '--feedback', request.feedback);
  optionalArgument(args, '--note', request.note);
  optionalArgument(args, '--url', request.url);
  const result = await runCareerOpsNodeScript(root, 'outcome.mjs', args, 90_000);
  if (result.code !== 0) scriptFailure('outcome.mjs', result.stdout, result.stderr, result.code);
  return {
    ok: true,
    message: `申请 #${request.rowNumber} 的结果已归档。`,
    detail: parseJson<Record<string, unknown>>(result.stdout, 'outcome.mjs'),
    snapshot: loadCareerOpsSnapshot(root),
  };
}
