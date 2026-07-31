import { access, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { stringify } from 'yaml';
import type { JobEvaluation } from './contracts';
import type { EvaluatedJobDraft } from './job-model-runner';
import type { JobSource } from './job-source';
import { runCareerOpsNodeScript } from './career-ops-adapter';

const TRACKER_HEADER = `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
`;

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown-company';
}

function inline(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tableCell(value: string): string {
  return inline(value).replace(/\|/g, '\\|');
}

function scoreText(score: number): string {
  return `${score.toFixed(1)}/5`;
}

function workAuthLabel(value: EvaluatedJobDraft['workAuth']): string {
  return {
    sponsors: '✅ Sponsors',
    not_needed: '➖ Not needed',
    unstated: '⚠️ Unstated',
    no_sponsorship: '⛔ No sponsorship',
  }[value];
}

function costLabel(draft: EvaluatedJobDraft): string {
  return draft.usage.estimatedCostUsd === null
    ? 'Not calculated (pricing not configured)'
    : `$${draft.usage.estimatedCostUsd.toFixed(6)} USD`;
}

function riskEnum(value: string, allowed: string[]): string {
  const normalized = value.toLocaleLowerCase().replace(/[\s-]+/g, '_');
  return allowed.includes(normalized) ? normalized : 'not_evaluated';
}

function machineSummary(draft: EvaluatedJobDraft): string {
  const b = draft.blocks.find((block) => block.id === 'B');
  const hardStops = [
    draft.workAuth === 'no_sponsorship' ? 'JD explicitly states no sponsorship.' : '',
    draft.legitimacyTier === 'Suspicious' ? 'Posting legitimacy requires investigation.' : '',
  ].filter(Boolean);
  const payload = {
    company: draft.company,
    role: draft.role,
    score: draft.score,
    legitimacy_tier: draft.legitimacyTier,
    archetype: draft.archetype,
    final_decision: draft.finalDecision,
    hard_stops: hardStops,
    soft_gaps: b?.risks ?? [],
    top_strengths: b?.evidence.slice(0, 3).map((item) => item.quote) ?? [],
    risk_level: draft.legitimacyTier === 'Suspicious' ? 'High' : draft.errors.length > 2 ? 'Medium' : 'Low',
    confidence: draft.confidence,
    next_action: draft.finalDecision === 'Apply'
      ? 'Review the report and decide whether to prepare application materials.'
      : 'Resolve the listed risks before preparing application materials.',
    work_auth: draft.workAuth,
    discard_reasons: draft.finalDecision === 'Skip' ? b?.risks ?? ['overall_fit'] : [],
    via: null as string | null,
    company_confidential: draft.company === '?',
    advertised_comp: draft.advertisedComp,
    risk_summary: {
      legitimacy: draft.legitimacyTier.toLocaleLowerCase().replace(/\s+/g, '_'),
      classification: riskEnum(draft.riskSummary.classification ?? '', ['clear', 'flagged']),
      culture: riskEnum(draft.riskSummary.culture ?? '', ['pass', 'caution', 'fail']),
      interview_redflags: 'not_evaluated',
      ai_infra: riskEnum(draft.riskSummary.ai_infra ?? '', ['consistent', 'mismatch']),
    },
  };
  return stringify(payload, { lineWidth: 0 }).trim();
}

function blockMarkdown(block: EvaluatedJobDraft['blocks'][number]): string {
  const score = block.score === null ? '' : `\n\n**Block score:** ${block.score.toFixed(1)}/5`;
  const details = block.details.length
    ? `\n\n${block.details.map((item) => `- ${item}`).join('\n')}`
    : '';
  const evidence = block.evidence.length
    ? `\n\n### Evidence\n\n${block.evidence.map((item) => `- **${item.source}:** “${item.quote}”`).join('\n')}`
    : '\n\n### Evidence\n\n- No source-grounded evidence returned.';
  const risks = block.risks.length
    ? `\n\n### Risks and gaps\n\n${block.risks.map((item) => `- ${item}`).join('\n')}`
    : '\n\n### Risks and gaps\n\n- None identified from the supplied evidence.';
  return `## ${block.id}) ${block.title}\n\n${block.summary}${score}${details}${evidence}${risks}`;
}

function reportMarkdown(draft: EvaluatedJobDraft, source: JobSource, date: string): string {
  const riskRows = Object.entries(draft.riskSummary);
  const signals = draft.legitimacySignals.length
    ? draft.legitimacySignals.map((signal) => (
      `| ${tableCell(signal.name)} | ${signal.weight} | ${tableCell(signal.finding)} | ${tableCell(signal.evidence)} |`
    )).join('\n')
    : '| — | Neutral | No structured signals returned | — |';
  return `# Evaluation: ${draft.company} — ${draft.role}

**Date:** ${date}
**Company:** ${draft.company}
**Role:** ${draft.role}
**URL:** ${source.url || 'local:pasted-jd'}
**Via:** —
**Archetype:** ${draft.archetype}
**Score:** ${scoreText(draft.score)}
**Legitimacy:** ${draft.legitimacyTier}
**Work Auth:** ${workAuthLabel(draft.workAuth)}
**PDF:** pending

---

## Machine Summary

\`\`\`yaml
${machineSummary(draft)}
\`\`\`

## Evaluation Run

| Field | Value |
|-------|-------|
| Provider | ${tableCell(draft.model.provider)} |
| Model | ${tableCell(draft.model.name)} |
| Endpoint | ${tableCell(draft.model.endpoint)} |
| Tokens | ${draft.usage.inputTokens} input + ${draft.usage.outputTokens} output = ${draft.usage.totalTokens} total |
| Estimated cost | ${costLabel(draft)} |
| Evidence accepted | ${draft.evidenceCount} |
| Liveness | ${draft.liveness.status} — ${tableCell(draft.liveness.reason)} |
| Liveness engine | ${tableCell(draft.liveness.engine)} |

${draft.blocks.map(blockMarkdown).join('\n\n')}

### Block G signals

| Signal | Weight | Finding | Evidence |
|--------|--------|---------|----------|
${signals}

## Risk Summary

| Signal | Status |
|--------|--------|
${riskRows.map(([key, value]) => `| ${tableCell(key)} | ${tableCell(value)} |`).join('\n')}

## Errors and Limitations

${draft.errors.length ? draft.errors.map((item) => `- ${item}`).join('\n') : '- None recorded.'}

## Keywords extracted

${draft.keywords.length ? draft.keywords.map((item) => `- ${item}`).join('\n') : '- None returned.'}
`;
}

async function safeDirectory(root: string, relativePath: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const candidate = path.join(canonicalRoot, relativePath);
  await mkdir(candidate, { recursive: true });
  const resolved = await realpath(candidate);
  const relative = path.relative(canonicalRoot, resolved);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`${relativePath} 位于工作区之外。`);
  }
  if (!(await stat(resolved)).isDirectory()) throw new Error(`${relativePath} 不是目录。`);
  return resolved;
}

async function ensureTracker(root: string): Promise<void> {
  const dataDirectory = await safeDirectory(root, 'data');
  const tracker = path.join(dataDirectory, 'applications.md');
  try {
    await access(tracker);
  } catch {
    await writeFileAtomic(tracker, TRACKER_HEADER, { encoding: 'utf8' });
  }
}

async function reserveNumber(root: string): Promise<string> {
  const run = await runCareerOpsNodeScript(root, 'reserve-report-num.mjs', []);
  const number = run.stdout.trim().match(/^\d{3,}$/)?.[0];
  if (run.code !== 0 || !number) throw new Error(run.stderr.trim() || '无法保留报告编号。');
  return number;
}

async function releaseNumber(root: string, number: string): Promise<void> {
  await runCareerOpsNodeScript(root, 'reserve-report-num.mjs', ['--release', number]);
}

async function addTrackerEntry(
  root: string,
  number: string,
  date: string,
  draft: EvaluatedJobDraft,
  reportName: string,
): Promise<'merged' | 'pending' | 'failed'> {
  await ensureTracker(root);
  const additions = await safeDirectory(root, 'batch/tracker-additions');
  const additionName = `${number}-${slug(draft.company)}.tsv`;
  const note = inline(`${draft.finalDecision}; legitimacy ${draft.legitimacyTier}`);
  const fields = [
    number,
    date,
    inline(draft.company),
    inline(draft.role),
    'Evaluated',
    scoreText(draft.score),
    '❌',
    `[${number}](reports/${reportName})`,
    note,
  ];
  await writeFileAtomic(path.join(additions, additionName), `${fields.join('\t')}\n`, { encoding: 'utf8' });
  try {
    const run = await runCareerOpsNodeScript(root, 'merge-tracker.mjs', []);
    if (run.code === 0) return 'merged';
    return 'pending';
  } catch {
    return 'pending';
  }
}

export async function writeEvaluationReport(
  root: string,
  draft: EvaluatedJobDraft,
  source: JobSource,
): Promise<JobEvaluation> {
  const reports = await safeDirectory(root, 'reports');
  const number = await reserveNumber(root);
  const date = draft.generatedAt.slice(0, 10);
  const reportName = `${number}-${slug(draft.company)}-${date}.md`;
  const reportPath = path.join(reports, reportName);
  let reportWritten = false;
  try {
    await writeFileAtomic(reportPath, reportMarkdown(draft, source, date), { encoding: 'utf8' });
    reportWritten = true;
  } finally {
    await releaseNumber(root, number);
  }
  if (!reportWritten) throw new Error('报告写入失败。');
  const trackerStatus = await addTrackerEntry(root, number, date, draft, reportName);
  const errors = trackerStatus === 'merged'
    ? draft.errors
    : [...draft.errors, 'Tracker 合并未完成；TSV 已保留在 batch/tracker-additions/。'];
  return {
    ...draft,
    errors,
    reportName,
    reportRelativePath: `reports/${reportName}`,
    trackerStatus,
  };
}
