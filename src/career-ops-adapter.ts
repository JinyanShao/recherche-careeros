import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// These are career-ops system-layer entrypoints. Keeping the allowlist here
// prevents renderer input from ever selecting an arbitrary local Node script.
const ALLOWED_SYSTEM_SCRIPTS = new Set([
  'build-cv-html.mjs',
  'build-cv-latex.mjs',
  'check-liveness.mjs',
  'cv-templates.mjs',
  'detect-reposts.mjs',
  'generate-latex.mjs',
  'generate-pdf.mjs',
  'merge-tracker.mjs',
  'reconcile-pipeline.mjs',
  'reply-matcher.mjs',
  'reserve-report-num.mjs',
  'scan-ats-full.mjs',
  'scan.mjs',
  'set-status.mjs',
  'outcome.mjs',
  'followup-cadence.mjs',
  'followup-seed.mjs',
  'invite-match.mjs',
  'paste-reply.mjs',
  'verify-cv-facts.mjs',
  'verify-pipeline.mjs',
]);

const OFFICIAL_REMOTE = /^https:\/\/github\.com\/santifer\/career-ops(?:\.git)?\/?$/i;

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function careerOpsNodeExecutable(): Promise<string> {
  const candidates = [
    process.env.RECHERCHE_NODE_PATH,
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known installation.
    }
  }
  throw new Error('没有找到 Node.js，无法运行 career-ops。');
}

async function checkedRoot(root: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const packageFile = path.join(canonicalRoot, 'package.json');
  const agentFile = path.join(canonicalRoot, 'AGENTS.md');
  const [packageInfo, agentInfo] = await Promise.all([stat(packageFile), stat(agentFile)]);
  if (!packageInfo.isFile() || !agentInfo.isFile()) throw new Error('所选目录不是完整的 career-ops 工作区。');
  return canonicalRoot;
}

async function verifyOfficialSystemLayer(root: string, script: string): Promise<void> {
  if (process.env.RECHERCHE_TEST_ALLOW_UNVERIFIED_CAREER_OPS === '1') return;
  const remote = await execFileAsync('/usr/bin/git', ['-C', root, 'remote', 'get-url', 'origin'], { timeout: 5_000 })
    .then((result) => result.stdout.trim())
    .catch(() => '');
  if (!OFFICIAL_REMOTE.test(remote)) {
    throw new Error('为保护本机，Recherche CareerOS 只会执行来自 santifer/career-ops 官方 Git 工作区且未改动的系统脚本。请重新选择官方克隆目录。');
  }
  const tracked = await execFileAsync('/usr/bin/git', ['-C', root, 'ls-files', '--error-unmatch', script], { timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!tracked) throw new Error(`career-ops 系统脚本 ${script} 未受 Git 追踪，已阻止执行。`);
  const changed = await execFileAsync('/usr/bin/git', ['-C', root, 'diff', '--quiet', 'HEAD', '--', script], { timeout: 5_000 })
    .then(() => false)
    .catch((error: { code?: number }) => error.code === 1);
  if (changed) throw new Error(`career-ops 系统脚本 ${script} 已被本地修改，已阻止执行。用户资料不受此限制。`);
}

export async function resolveCareerOpsSystemScript(root: string, script: string): Promise<{ root: string; scriptPath: string }> {
  if (!ALLOWED_SYSTEM_SCRIPTS.has(script)) throw new Error('不允许执行未知的 career-ops 系统脚本。');
  const canonicalRoot = await checkedRoot(root);
  const scriptPath = await realpath(path.join(canonicalRoot, script));
  if (!isInsideRoot(canonicalRoot, scriptPath) || !(await stat(scriptPath)).isFile()) {
    throw new Error(`${script} 不在 career-ops 工作区内。`);
  }
  await verifyOfficialSystemLayer(canonicalRoot, script);
  return { root: canonicalRoot, scriptPath };
}

export async function runCareerOpsNodeScript(root: string, script: string, args: string[], timeoutMs = 75_000): Promise<{ stdout: string; stderr: string; code: number }> {
  const [node, resolved] = await Promise.all([careerOpsNodeExecutable(), resolveCareerOpsSystemScript(root, script)]);
  return new Promise((resolve, reject) => {
    const child = spawn(node, [resolved.scriptPath, ...args], {
      cwd: resolved.root,
      env: { ...process.env, PATH: `${path.dirname(node)}:${process.env.PATH ?? ''}` },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${script} 超时。`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk.slice(0, 200_000); });
    child.stderr.on('data', (chunk) => { stderr += chunk.slice(0, 50_000); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ stdout, stderr, code: code ?? 1 }); });
  });
}

// Thin bridge for career-ops' exported reply matcher. The script and its
// matching/classification rules stay entirely upstream; Recherche CareerOS merely
// marshals JSON across Electron's process boundary.
const REPLY_MATCHER_BRIDGE = `
import fs from 'node:fs';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const { matchCandidates, classifyReply } = await import(process.argv[1]);
const matches = matchCandidates(input.candidates, input.applications, input.followups);
console.log(JSON.stringify(input.candidates.map((candidate, index) => ({
  candidate,
  classification: classifyReply(candidate),
  match: matches[index] ?? null,
}))));
`;

export async function runCareerOpsReplyMatcher(
  root: string,
  input: { candidates: unknown[]; applications: unknown[]; followups: unknown[] },
  timeoutMs = 15_000,
): Promise<string> {
  const [node, resolved] = await Promise.all([
    careerOpsNodeExecutable(),
    resolveCareerOpsSystemScript(root, 'reply-matcher.mjs'),
  ]);
  return new Promise((resolve, reject) => {
    const child = spawn(node, ['--input-type=module', '--eval', REPLY_MATCHER_BRIDGE, pathToFileURL(resolved.scriptPath).href], {
      cwd: resolved.root,
      env: { ...process.env, PATH: `${path.dirname(node)}:${process.env.PATH ?? ''}` },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('reply-matcher.mjs 超时。'));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk.slice(0, 200_000); });
    child.stderr.on('data', (chunk) => { stderr += chunk.slice(0, 50_000); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(stderr.trim() || `reply-matcher.mjs 退出码 ${code ?? 1}`));
      else resolve(stdout);
    });
    child.stdin.end(JSON.stringify(input));
  });
}

export async function spawnCareerOpsNodeScript(root: string, script: 'scan.mjs' | 'scan-ats-full.mjs', args: string[]): Promise<ChildProcessWithoutNullStreams> {
  const [node, resolved] = await Promise.all([careerOpsNodeExecutable(), resolveCareerOpsSystemScript(root, script)]);
  return spawn(node, [resolved.scriptPath, ...args], {
    cwd: resolved.root,
    env: { ...process.env, PATH: `${path.dirname(node)}:${process.env.PATH ?? ''}` },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
