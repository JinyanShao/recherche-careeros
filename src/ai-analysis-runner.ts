import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  AdvicePriority,
  AdviceSurface,
  CareerOpsSnapshot,
  CompetitivenessAdvice,
  CompetitivenessAnalysis,
  PositioningProposal,
} from './contracts';
import { codexExecutable } from './competitiveness-analysis';

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['advice', 'positioning', 'limitations'],
  properties: {
    advice: {
      type: 'array',
      minItems: 4,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'surface', 'priority', 'title', 'detail', 'evidence'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 100 },
          surface: { enum: ['CV', 'LinkedIn', 'GitHub', 'Portfolio'] },
          priority: { enum: ['high', 'medium', 'low'] },
          title: { type: 'string', minLength: 1, maxLength: 180 },
          detail: { type: 'string', minLength: 1, maxLength: 900 },
          evidence: {
            type: 'array', minItems: 1, maxItems: 5,
            items: { type: 'string', minLength: 1, maxLength: 500 },
          },
        },
      },
    },
    positioning: {
      type: 'object',
      additionalProperties: false,
      required: ['headline', 'statement', 'strengths'],
      properties: {
        headline: { type: 'string', minLength: 1, maxLength: 180 },
        statement: { type: 'string', minLength: 1, maxLength: 900 },
        strengths: {
          type: 'array', minItems: 2, maxItems: 5,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'evidence'],
            properties: {
              text: { type: 'string', minLength: 1, maxLength: 240 },
              evidence: { type: 'string', minLength: 1, maxLength: 500 },
            },
          },
        },
      },
    },
    limitations: {
      type: 'array', maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 500 },
    },
  },
} as const;

type AiOutput = {
  advice: CompetitivenessAdvice[];
  positioning: PositioningProposal;
  limitations: string[];
};

function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function supportedEvidence(evidence: string, source: string): boolean {
  if (/^(cv\.md|config\/profile\.yml)#/.test(evidence)) return true;
  const candidate = normalized(evidence.replace(/^['"]|['"]$/g, ''));
  return candidate.length >= 12 && normalized(source).includes(candidate);
}

function validateOutput(value: unknown, source: string): AiOutput {
  if (!value || typeof value !== 'object') throw new Error('AI returned an invalid analysis object.');
  const output = value as Partial<AiOutput>;
  if (!Array.isArray(output.advice) || !output.positioning || !Array.isArray(output.limitations)) {
    throw new Error('AI analysis is missing required sections.');
  }
  const surfaces = new Set<AdviceSurface>(['CV', 'LinkedIn', 'GitHub', 'Portfolio']);
  const priorities = new Set<AdvicePriority>(['high', 'medium', 'low']);
  for (const advice of output.advice) {
    if (!surfaces.has(advice.surface) || !priorities.has(advice.priority)) {
      throw new Error('AI advice contains an unsupported category.');
    }
    if (!advice.evidence.every((item) => supportedEvidence(item, source))) {
      throw new Error(`AI advice "${advice.title}" contains evidence not found in the approved source files.`);
    }
  }
  for (const strength of output.positioning.strengths) {
    if (!supportedEvidence(strength.evidence, source)) {
      throw new Error(`AI positioning strength "${strength.text}" is not grounded in the approved source files.`);
    }
  }
  return output as AiOutput;
}

function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  input: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('AI analysis timed out after 180 seconds.'));
    }, 180_000);
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < 120_000) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 120_000) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`增强分析失败（${code ?? 'unknown'}）：${stderr.trim() || stdout.trim()}`));
    });
    child.stdin.end(input);
  });
}

export async function enhanceWithAi(
  root: string,
  snapshot: CareerOpsSnapshot,
  baseline: CompetitivenessAnalysis,
): Promise<CompetitivenessAnalysis> {
  const executable = codexExecutable(baseline);
  if (!executable) throw new Error('本机未安装可用的增强分析运行时。');
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'recherche-ai-analysis-'));
  const schemaPath = path.join(tempRoot, 'schema.json');
  const outputPath = path.join(tempRoot, 'analysis.json');
  await writeFile(schemaPath, JSON.stringify(OUTPUT_SCHEMA), { mode: 0o600 });
  const outputLanguage = snapshot.profileSummary.outputLanguage || 'en';
  const prompt = `You are running the career-ops competitiveness-analysis stage.

Hard rules:
- Analyze only the supplied cv.md, config/profile.yml, and derived market snapshot below.
- Do not browse, run tools, inspect other files, or modify anything.
- Never invent experience, authorship, dates, metrics, credentials, work authorization, language level, salary, study status, or availability.
- Every advice item and positioning strength must cite either an exact source quote (12+ characters) or a source anchor beginning cv.md# or config/profile.yml#.
- Market counts are scanner coverage, not a labour-market census.
- Write all human-facing text in ${outputLanguage}.
- Return only data matching the provided JSON schema.

The numerical score is fixed by the evidence engine and must not be recomputed: ${baseline.score}/100.

MARKET SNAPSHOT
${JSON.stringify(baseline.market, null, 2)}

CURRENT BASELINE ADVICE
${JSON.stringify(baseline.advice, null, 2)}

cv.md
---
${snapshot.cv.content}
---

config/profile.yml
---
${snapshot.profile.content}
---
`;

  try {
    await runProcess(executable, [
      'exec',
      '--sandbox', 'read-only',
      '--ephemeral',
      '--ignore-user-config',
      '--skip-git-repo-check',
      '--output-schema', schemaPath,
      '--output-last-message', outputPath,
      '-C', root,
      '-',
    ], root, prompt);
    const raw = await readFile(outputPath, 'utf8');
    const output = validateOutput(JSON.parse(raw), `${snapshot.cv.content}\n${snapshot.profile.content}`);
    const id = createHash('sha256')
      .update(baseline.id)
      .update(raw)
      .digest('hex');
    return {
      ...baseline,
      id,
      generatedAt: new Date().toISOString(),
      advice: output.advice,
      positioning: output.positioning,
      provider: {
        mode: 'ai',
        label: '增强分析 · 受证据约束',
        available: true,
        detail: 'Read-only sandbox, structured output, source-evidence validation.',
      },
      limitations: [...baseline.limitations, ...output.limitations],
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
