import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { configuredNodeExecutable, requiredCareerOpsSource } from './env.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const careerOpsSource = requiredCareerOpsSource('verify-stage7');
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'recherche-stage7-'));
const electronData = path.join(fixtureRoot, 'electron-data');
const electronExecutable = path.join(projectRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const nodeExecutable = configuredNodeExecutable();

await Promise.all([
  mkdir(path.join(fixtureRoot, 'config'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'data'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'reports'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'modes'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'lib'), { recursive: true }),
]);

for (const file of [
  'cv-templates.mjs',
  'build-cv-html.mjs',
  'verify-cv-facts.mjs',
  'generate-pdf.mjs',
  'build-cv-latex.mjs',
  'generate-latex.mjs',
  'cv-sections-core.mjs',
  'theme-style.mjs',
]) {
  await cp(path.join(careerOpsSource, file), path.join(fixtureRoot, file));
}
await cp(path.join(careerOpsSource, 'lib/latex-escape.mjs'), path.join(fixtureRoot, 'lib/latex-escape.mjs'));
await cp(path.join(careerOpsSource, 'templates'), path.join(fixtureRoot, 'templates'), { recursive: true });
await symlink(path.join(careerOpsSource, 'node_modules'), path.join(fixtureRoot, 'node_modules'), 'dir');

const cv = `# Fixture Candidate

## Summary

Backend engineer using Python, FastAPI, SQL, REST APIs, tests, Git and AWS.

## Experience

### Backend Engineer | Fixture Systems | Switzerland | 2023-present

- Built Python services and production APIs.
- Maintained SQL databases and automated tests.

## Projects

### Order API

- Designed a FastAPI order service with REST endpoints.

## Education

Computer Science coursework.

## Skills

Python, FastAPI, SQL, REST APIs, AWS, Git
`;
const profile = `candidate:
  full_name: Fixture Candidate
  email: fixture@example.com
  location: Switzerland
target_roles:
  primary: [Backend Engineer]
language:
  output: en
spend_tier: standard
`;
const highReport = `# Fixture Labs - Backend Engineer

**Score:** 4.4/5
**URL:** https://example.com/jobs/fixture
**Legitimacy:** High Confidence

## Block A

Fixture Labs seeks a Backend Engineer to build Python and FastAPI services.
`;
const lowReport = `# Low Fit Labs - Java Engineer

**Score:** 3.2/5
**URL:** https://example.com/jobs/low-fit
**Legitimacy:** Proceed with Caution

## Block A

Low Fit Labs seeks a Java Engineer.
`;

await Promise.all([
  cp(path.join(careerOpsSource, 'package.json'), path.join(fixtureRoot, 'package.json')),
  writeFile(path.join(fixtureRoot, 'AGENTS.md'), '# Fixture career-ops\n'),
  writeFile(path.join(fixtureRoot, 'scan.mjs'), 'export {};\n'),
  writeFile(path.join(fixtureRoot, 'cv.md'), cv),
  writeFile(path.join(fixtureRoot, 'article-digest.md'), '# Evidence\n\nFixture Candidate documents technical decisions.\n'),
  writeFile(path.join(fixtureRoot, 'config/profile.yml'), profile),
  writeFile(path.join(fixtureRoot, 'modes/_profile.md'), '# Positioning\n\nBackend Engineer focused on reliable APIs.\n'),
  writeFile(path.join(fixtureRoot, 'modes/_custom.md'), '# Rules\n\nUse direct language.\n'),
  writeFile(path.join(fixtureRoot, 'data/pipeline.md'), '# Pipeline\n'),
  writeFile(path.join(fixtureRoot, 'reports/001-fixture-labs-2026-07-31.md'), highReport),
  writeFile(path.join(fixtureRoot, 'reports/002-low-fit-labs-2026-07-31.md'), lowReport),
]);

let modelCalls = 0;
let invalidEvidence = true;
let revision = 0;
function modelDraft() {
  if (!invalidEvidence) revision += 1;
  const suffix = revision > 1 ? ' I would begin by mapping the service boundaries.' : '';
  return {
    company: 'Fixture Labs',
    role: 'Backend Engineer',
    language: 'en',
    pageFormat: 'a4',
    cv: {
      lang: 'en', page_format: 'a4',
      candidate: {
        name: 'Fixture Candidate', phone: '', email: 'fixture@example.com',
        linkedin: { url: '', display: '' }, github: { url: '', display: '' },
        portfolio: { url: '', display: '' }, location: 'Switzerland',
      },
      sections: { summary: 'Summary', competencies: 'Core Competencies', experience: 'Experience', projects: 'Projects', education: 'Education', certifications: 'Certifications', skills: 'Skills' },
      summary: `Backend engineer focused on reliable Python APIs.${suffix}`,
      competencies: ['Python', 'FastAPI', 'SQL', 'REST APIs', 'Testing', 'Git'],
      experience: [{ company: 'Fixture Systems', role: 'Backend Engineer', location: 'Switzerland', dates: '2023-present', bullets: ['Built Python services and production APIs.', 'Maintained SQL databases and automated tests.'] }],
      projects: [{ name: 'Order API', badge: '', tech: 'Python, FastAPI', description: 'Designed a FastAPI order service with REST endpoints.' }],
      education: [{ title: 'Computer Science coursework', org: '', year: '', description: '' }],
      certifications: [],
      skills: [{ category: 'Backend', items: ['Python', 'FastAPI', 'SQL', 'REST APIs'] }, { category: 'Delivery', items: ['Testing', 'Git', 'AWS'] }],
    },
    coverLetter: `Dear Hiring Manager,\n\nI am applying because the role combines reliable APIs with product collaboration. I have built Python services and production APIs, maintained SQL databases, and automated tests. My background aligns with the team's need for practical backend delivery.\n\nFixture Labs is addressing the challenge of growing dependable services while keeping engineering decisions clear. That balance is the reason this role is relevant to me. I would bring a direct, evidence-led approach to the work and use the existing context before proposing changes.\n\nMy first move would be to map the service boundaries, current reliability signals, and the decisions that matter most to the product team. From there, I would identify one focused improvement that can be measured and reviewed with the engineers who own the system.\n\nI would welcome a conversation about the backend role and the team's priorities.\n\nSincerely,\nFixture Candidate`,
    email: { subject: `Application: Backend Engineer${revision > 1 ? ' - revised' : ''}`, body: 'Hello,\n\nI am applying for the Backend Engineer role. My experience includes Python services, production APIs, SQL databases, and automated tests. The role fits my focus on reliable backend delivery.\n\nI have attached a tailored CV and cover letter for review. I would welcome the opportunity to discuss the team priorities and how I could contribute.\n\nBest,\nFixture Candidate' },
    linkedin: { headline: 'Backend Engineer | Python, FastAPI, SQL', about: 'Backend engineer focused on reliable Python APIs and clear technical decisions.', outreach: 'Hello, I am interested in the Backend Engineer role at Fixture Labs. My background includes Python services, FastAPI, SQL, and automated testing. I would value a short conversation about the team priorities.' },
    evidence: invalidEvidence
      ? [{ source: 'cv.md', quote: 'not present' }, { source: 'profile.yml', quote: 'Fixture Candidate' }, { source: 'report', quote: 'Fixture Labs seeks a Backend Engineer' }]
      : [{ source: 'cv.md', quote: 'Built Python services and production APIs.' }, { source: 'profile.yml', quote: 'Fixture Candidate' }, { source: 'report', quote: 'Fixture Labs seeks a Backend Engineer' }],
    gaps: ['Visa sponsorship is not stated.'],
  };
}

const server = createServer((request, response) => {
  if (request.url === '/v1/chat/completions' && request.method === 'POST') {
    modelCalls += 1;
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      assert.equal(request.headers.authorization, 'Bearer stage7-secret-key');
      assert.equal(JSON.parse(body).model, 'fixture-material-model');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(modelDraft()) } }],
        usage: { prompt_tokens: 1200, completion_tokens: 800 },
      }));
    });
    return;
  }
  response.writeHead(404); response.end('not found');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;

const app = await electron.launch({
  executablePath: electronExecutable,
  args: [projectRoot, `--user-data-dir=${electronData}`],
  env: { ...process.env, CAREER_OPS_ROOT: fixtureRoot, RECHERCHE_NODE_PATH: nodeExecutable, RECHERCHE_TEST_ALLOW_UNVERIFIED_CAREER_OPS: '1' },
});

try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1040, height: 720 });
  page.setDefaultTimeout(90_000);
  await page.waitForFunction(() => document.querySelector('#profile-name')?.textContent === 'Fixture Candidate');
  await page.evaluate((url) => window.careerOps.saveAiSettings({
    provider: 'openai-compatible', baseUrl: `${url}/v1`, model: 'fixture-material-model', apiKey: 'stage7-secret-key',
    inputPricePerMillion: 1, outputPricePerMillion: 2, clearKey: false,
  }), baseUrl);

  const apiNames = await page.evaluate(() => Object.keys(window.careerOps));
  assert.equal(apiNames.some((name) => /send|publish|submit/i.test(name)), false);
  const initialSnapshot = await page.evaluate(() => window.careerOps.getSnapshot());
  assert.equal(initialSnapshot.validation.root, await realpath(fixtureRoot));
  assert.equal(initialSnapshot.reports.length, 2);
  const initialWorkspace = await page.evaluate(() => window.careerOps.getApplicationMaterialsWorkspace());
  assert.equal(initialWorkspace.reports.length, 2);

  await page.locator('.nav-item[data-section="jobs"]').click();
  await page.locator('[data-route="jobs-reports"]').click();
  await page.locator('[data-report="001-fixture-labs-2026-07-31.md"]').click();
  await page.locator('#prepare-report-application-button').waitFor({ state: 'visible' });
  await page.locator('#prepare-report-application-button').click();
  await page.waitForFunction(() => document.body.dataset.navigationRoute === 'applications-materials');
  await page.waitForFunction(() => document.querySelector('#material-report')?.value === '001-fixture-labs-2026-07-31.md');
  assert.equal(await page.locator('#applications-workflow-panel').isVisible(), true);
  assert.equal(await page.locator('#application-flow-reports').textContent(), '2');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);

  await page.locator('.nav-item[data-section="applications"]').click();
  await page.locator('[data-route="applications-materials"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#material-report option').length === 3, null, { timeout: 15_000 });

  await page.locator('#material-report').selectOption('002-low-fit-labs-2026-07-31.md');
  await page.locator('#material-motivation').fill('I want to work on dependable backend systems.');
  await page.locator('#material-company-context').fill('The company needs reliable services and clear engineering decisions.');
  await page.locator('#material-first-move').fill('Map service boundaries and reliability signals with the team.');
  await page.getByRole('button', { name: '生成新版本' }).click();
  await page.waitForFunction(() => document.querySelector('#notice')?.textContent?.includes('低于 4.0'));
  assert.equal(modelCalls, 0, 'low-score gate must run before the model');

  await page.locator('#material-report').selectOption('001-fixture-labs-2026-07-31.md');
  await page.getByRole('button', { name: '生成新版本' }).click();
  await page.waitForFunction(() => document.querySelector('#material-generation-state')?.textContent?.includes('validation'));
  assert.equal(modelCalls, 1);
  assert.equal((await readdir(path.join(fixtureRoot, 'output/application-materials')).catch(() => [])).length, 0, 'invalid evidence must fail before version creation');

  invalidEvidence = false;
  await page.getByRole('button', { name: '生成新版本' }).click();
  try {
    await page.waitForFunction(() => document.querySelector('#material-generation-state')?.textContent?.includes('v001 已完成'));
  } catch (error) {
    console.error(JSON.stringify({
      state: await page.locator('#material-generation-state').textContent(),
      notice: await page.locator('#notice').textContent(),
    }));
    throw error;
  }
  const firstDirectory = path.join(fixtureRoot, 'output/application-materials/001-fixture-labs-backend-engineer/v001');
  for (const file of ['cv.html', 'cv.pdf', 'cv.tex', 'cv-latex.pdf', 'cover-letter.md', 'email.md', 'linkedin.md', 'manifest.json']) await stat(path.join(firstDirectory, file));
  assert.ok((await stat(path.join(firstDirectory, 'cv.pdf'))).size > 1_000);
  assert.ok((await stat(path.join(firstDirectory, 'cv-latex.pdf'))).size > 1_000);
  assert.match(await readFile(path.join(firstDirectory, 'manifest.json'), 'utf8'), /fixture-material-model/);
  await page.locator('.nav-item[data-section="applications"]').click();
  await page.locator('[data-route="applications-materials"]').click();
  await page.locator('.workspace').evaluate((node) => { node.scrollTop = 0; });
  await page.screenshot({ path: path.join(projectRoot, 'stage-7-application-materials.png'), fullPage: true });

  await page.locator('.nav-item[data-section="applications"]').click();
  await page.locator('[data-route="applications-materials"]').click();
  await page.locator('#material-version-note').fill('Second reviewed positioning');
  await page.getByRole('button', { name: '生成新版本' }).click();
  await page.waitForFunction(() => document.querySelector('#material-generation-state')?.textContent?.includes('v002 已完成'));
  const secondDirectory = path.join(fixtureRoot, 'output/application-materials/001-fixture-labs-backend-engineer/v002');
  await stat(path.join(secondDirectory, 'manifest.json'));
  assert.equal(await page.locator('#material-history-list .material-history-item').count(), 2);
  await page.locator('#comparison-from').selectOption('1');
  await page.locator('#comparison-to').selectOption('2');
  await page.getByRole('button', { name: '比较版本' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#comparison-result .comparison-file').length > 0);
  assert.match(await page.locator('#comparison-result').textContent() ?? '', /cv-payload.json/);
  await page.screenshot({ path: path.join(projectRoot, 'stage-7-version-comparison.png'), fullPage: true });
  await page.setViewportSize({ width: 1040, height: 720 });
  const overflow = await page.locator('#materials-view').evaluate((root) => (
    [...root.querySelectorAll('.material-generator, .material-workbench, .material-history-panel, .material-comparison-panel')]
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => ({ className: node.className, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }))
  ));
  assert.deepEqual(overflow, []);

  console.log(JSON.stringify({
    fixtureRoot,
    lowScoreBlockedBeforeModel: true,
    exactEvidenceGate: true,
    generatedVersions: 2,
    pdfGenerated: true,
    latexSourceGenerated: true,
    latexPdfGeneratedWithTectonic: true,
    comparisonRendered: true,
    sendingCapabilities: false,
  }, null, 2));
} finally {
  await app.close();
  await new Promise((resolve) => server.close(resolve));
}
