import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile, appendFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { parseDocument } from 'yaml';
import { configuredNodeExecutable } from './env.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'recherche-stage5-'));
const electronData = path.join(fixtureRoot, 'electron-data');
const electronExecutable = path.join(projectRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const packagedExecutable = path.join(projectRoot, 'out/Recherche CareerOS-darwin-arm64/Recherche CareerOS.app/Contents/MacOS/Recherche CareerOS');
const nodeExecutable = configuredNodeExecutable();
await stat(packagedExecutable);
await Promise.all([
  mkdir(path.join(fixtureRoot, 'config'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'data/cache'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'reports'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'modes'), { recursive: true }),
]);

const portals = `# stage5 portal comment must survive
title_filter:
  positive: ["Backend Engineer", "Python Developer"]
  negative: ["Senior"]
location_filter:
  allow: ["Switzerland", "Remote"]
  block: ["United States"]
max_posting_age_days: 30
trust_filter:
  enabled: true
tracked_companies:
  - name: Fixture Green
    careers_url: https://job-boards.greenhouse.io/fixture
    api: https://boards-api.greenhouse.io/v1/boards/fixture/jobs
    enabled: true
  - name: Fixture Lever
    careers_url: https://jobs.lever.co/fixture
    enabled: true
  - name: Slow Fixture
    careers_url: https://jobs.ashbyhq.com/slow-fixture
    enabled: true
job_boards: []
`;

const scanShim = `import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
const now = new Date().toISOString();
appendFileSync('data/scan-history.tsv', 'https://job-boards.greenhouse.io/fixture/jobs/new\\t2026-07-30\\tgreenhouse-api\\tPython Backend Engineer\\tFixture Green\\tadded\\tRemote\\tnewfingerprint000\\t2026-07-30\\t96\\t\\tfixture green\\n');
appendFileSync('data/pipeline.md', '- [ ] https://job-boards.greenhouse.io/fixture/jobs/new | Fixture Green | Python Backend Engineer | Remote | posted:2026-07-30\\n');
appendFileSync('data/scan-runs.tsv', now + '\\tcompleted\\t3\\t0\\t8\\t4\\t0\\t0\\t0\\t0\\t0\\t0\\t2\\t1\\t0\\t0\\t0\\t0\\t0\\n');
appendFileSync('data/portal-health.tsv', now + '\\tFixture Green\\treachable\\n');
console.log('Portal Scan fixture complete');
`;

const fullShim = `import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const checkpoint = 'data/cache/ats-full-checkpoint.json';
if (args.includes('--since') && args[args.indexOf('--since') + 1] === '99') {
  writeFileSync(checkpoint, JSON.stringify({ fixture: true }));
  console.error('checkpoint saved');
  setInterval(() => {}, 1000);
} else {
  const resumed = args.includes('--resume') && existsSync(checkpoint);
  if (existsSync(checkpoint)) unlinkSync(checkpoint);
  process.stdout.write(JSON.stringify({ date: '2026-07-30', sources: args[args.indexOf('--ats') + 1].split(','), resumed, companiesScanned: 12, postingsKept: 3, saved: !args.includes('--dry-run'), offers: [] }) + '\\n');
}
`;

const repostShim = `console.log(JSON.stringify({ metadata: { windowDays: 90, totalRows: 5, clusters: 1 }, clusters: [{ company: 'Fixture Green', role: 'Backend Engineer', repostCount: 2, firstSeen: '2026-07-01', lastSeen: '2026-07-20', daysSpan: 19, appearances: [{ url: 'https://example.com/jobs/backend-1' }, { url: 'https://example.com/jobs/backend-2' }] }] }));`;

const history = `url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\tfingerprint\tposted_at\ttrust_score\ttrust_flags\tnormalized_company
https://example.com/jobs/backend-1\t2026-07-01\tgreenhouse-api\tBackend Engineer\tFixture Green\tadded\tZurich\trepostfp00000001\t2026-07-01\t100\t\tfixture green
https://example.com/jobs/backend-2\t2026-07-20\tgreenhouse-api\tBackend Engineer\tFixture Green\tadded\tRemote\trepostfp00000002\t2026-07-20\t72\tsuspicious_domain\tfixture green
https://example.com/jobs/shared-a\t2026-07-29\tlever-api\tPython Developer\tFixture Lever\tadded\tGeneva\tsharedfp00000001\t2026-07-29\t100\t\tfixture lever
https://example.com/jobs/shared-b\t2026-07-29\tashby-api\tPython Developer\tAgency Fixture\tadded\tGeneva\tsharedfp00000001\t2026-07-29\t100\t\tagency fixture
https://example.com/jobs/expired\t2026-07-28\tashby-api\tBackend Developer\tSlow Fixture\tskipped_expired\tRemote\t\t2026-07-28\t\t\tslow fixture
`;

await Promise.all([
  writeFile(path.join(fixtureRoot, 'AGENTS.md'), '# Fixture\n'),
  writeFile(path.join(fixtureRoot, 'package.json'), '{"name":"career-ops-stage5-fixture","private":true}\n'),
  writeFile(path.join(fixtureRoot, 'cv.md'), '# Fixture Candidate\n\n## Summary\n\nPython backend engineer.\n'),
  writeFile(path.join(fixtureRoot, 'config/profile.yml'), 'candidate:\n  full_name: Fixture Candidate\nlocation:\n  country: Switzerland\ntarget_roles:\n  primary: [Backend Engineer]\n'),
  writeFile(path.join(fixtureRoot, 'modes/_profile.md'), '# Profile\n'),
  writeFile(path.join(fixtureRoot, 'portals.yml'), portals),
  writeFile(path.join(fixtureRoot, 'scan.mjs'), scanShim),
  writeFile(path.join(fixtureRoot, 'scan-ats-full.mjs'), fullShim),
  writeFile(path.join(fixtureRoot, 'detect-reposts.mjs'), repostShim),
  writeFile(path.join(fixtureRoot, 'data/scan-history.tsv'), history),
  writeFile(path.join(fixtureRoot, 'data/pipeline.md'), '# Pipeline\n\n- [ ] https://example.com/jobs/backend-2 | Fixture Green | Backend Engineer | Remote | posted:2026-07-20 | trust:72\n'),
  writeFile(path.join(fixtureRoot, 'data/portal-health.tsv'), 'timestamp\tcompany\tstatus\n2026-07-30T08:00:00Z\tFixture Green\treachable\n2026-07-30T08:00:00Z\tFixture Lever\tslug_gone\n'),
  writeFile(path.join(fixtureRoot, 'data/scan-runs.tsv'), 'timestamp\tstatus\tcompanies\tboards\tfound\tfiltered_title\tfiltered_tier\tfiltered_location\tfiltered_posting_age\tfiltered_salary\tfiltered_content\tfiltered_cooldown\tdupes\tnew_added\terrors\tfiltered_blacklist\tfiltered_visa\tfiltered_posted_date\tfiltered_country_eligibility\n2026-07-30T08:00:00Z\tcompleted\t3\t0\t12\t5\t0\t1\t0\t0\t0\t0\t2\t4\t1\t0\t0\t0\t0\n'),
]);

const app = await electron.launch({
  executablePath: electronExecutable,
  args: [projectRoot, `--user-data-dir=${electronData}`],
  env: { ...process.env, CAREER_OPS_ROOT: fixtureRoot, RECHERCHE_NODE_PATH: nodeExecutable, RECHERCHE_TEST_ALLOW_UNVERIFIED_CAREER_OPS: '1' },
});

try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.waitForFunction(() => document.querySelector('#profile-name')?.textContent === 'Fixture Candidate');
  await page.locator('.nav-item[data-section="jobs"]').click();
  await page.locator('[data-route="jobs-discover"]').click();
  await page.waitForFunction(() => document.querySelector('#ats-total-jobs')?.textContent === '5');
  assert.equal(await page.locator('#ats-pipeline-jobs').textContent(), '1');
  assert.equal(await page.locator('#ats-health-count').textContent(), '1');
  assert.match(await page.locator('#ats-job-body').textContent() ?? '', /跨站重复/);
  assert.match(await page.locator('#ats-job-body').textContent() ?? '', /重发 ×2/);
  assert.match(await page.locator('#ats-job-body').textContent() ?? '', /已失效/);
  await page.screenshot({ path: path.join(projectRoot, 'stage-5-job-center.png'), fullPage: true });

  await page.locator('.nav-item[data-section="settings"]').click();
  await page.locator('[data-route="settings-sources"]').click();
  await page.waitForSelector('.portal-row');
  assert.equal(await page.locator('.portal-row').count(), 3);
  await page.locator('.portal-row').first().locator('input[data-portal-field="name"]').fill('Fixture Greenhouse');
  await page.getByRole('button', { name: '保存职位来源' }).click();
  await page.waitForFunction(() => document.querySelector('#portal-save-state')?.textContent === '已安全保存');
  const saved = await readFile(path.join(fixtureRoot, 'portals.yml'), 'utf8');
  assert.match(saved, /stage5 portal comment must survive/);
  assert.equal(parseDocument(saved).getIn(['tracked_companies', 0, 'name']), 'Fixture Greenhouse');
  const backups = await readdir(path.join(fixtureRoot, 'data/backups/portals'));
  assert.equal(backups.length, 1);
  await page.screenshot({ path: path.join(projectRoot, 'stage-5-portals.png'), fullPage: true });

  await page.locator('.nav-item[data-section="jobs"]').click();
  await page.locator('[data-route="jobs-discover"]').click();
  await page.locator('#start-scan-button').click();
  await page.waitForFunction(() => document.querySelector('#scan-state-label')?.textContent?.startsWith('已完成'));
  await page.waitForFunction(() => document.querySelector('#ats-total-jobs')?.textContent === '6');

  await page.getByRole('button', { name: '全量扫描' }).click();
  await page.locator('#full-since-days').fill('99');
  await page.locator('#start-scan-button').click();
  await page.waitForFunction(() => document.querySelector('#scan-state-label')?.textContent?.startsWith('扫描中'));
  await page.waitForFunction(() => document.querySelector('#scan-log')?.textContent?.includes('checkpoint saved'));
  await page.getByRole('button', { name: '停止扫描' }).click();
  await page.waitForFunction(() => document.querySelector('#scan-state-label')?.textContent?.startsWith('已停止'));
  await stat(path.join(fixtureRoot, 'data/cache/ats-full-checkpoint.json'));

  await page.locator('#full-since-days').fill('3');
  await page.locator('#full-resume').check();
  await page.locator('#start-scan-button').click();
  await page.waitForFunction(() => document.querySelector('#scan-state-label')?.textContent?.startsWith('已完成'));
  const finalRun = await page.evaluate(() => window.careerOps.getScanStatus());
  assert.equal(finalRun.result.resumed, true);
  await page.screenshot({ path: path.join(projectRoot, 'stage-5-scan-console.png'), fullPage: true });

  await page.locator('.nav-item[data-section="settings"]').click();
  await page.locator('[data-route="settings-sources"]').click();
  const firstName = page.locator('.portal-row').first().locator('input[data-portal-field="name"]');
  await firstName.fill('Conflict Draft Name');
  await appendFile(path.join(fixtureRoot, 'portals.yml'), '\n# external edit\n');
  await page.getByRole('button', { name: '保存职位来源' }).click();
  await page.waitForFunction(() => document.querySelector('#notice')?.textContent?.includes('磁盘上被其他进程修改'));
  assert.equal(await firstName.inputValue(), 'Conflict Draft Name');

  const exposedMethods = await page.evaluate(() => Object.keys(window.careerOps).sort());
  assert.deepEqual(exposedMethods, ['analyzeReply', 'cancelBatch', 'cancelScan', 'compareApplicationMaterialVersions', 'confirmPositioning', 'createAiService', 'deleteAiService', 'evaluateJob', 'generateApplicationMaterials', 'getAiSettings', 'getApplicationMaterialsWorkspace', 'getAtsWorkspace', 'getAutomationWorkspace', 'getBatchStatus', 'getCompetitivenessAnalysis', 'getFollowupCadence', 'getScanStatus', 'getSnapshot', 'listAiModels', 'matchInvite', 'openApplicationMaterial', 'readReport', 'recordOutcome', 'runAiCompetitivenessAnalysis', 'saveAiSettings', 'saveCv', 'saveDailyAutomation', 'savePortals', 'saveProfile', 'seedFollowup', 'selectAiService', 'selectDirectory', 'startBatch', 'startScan', 'testAiConnection', 'updateTrackerStatus']);
  console.log(JSON.stringify({ fixtureRoot, jobsRendered: 6, portalBackup: true, commentPreserved: true, quickScan: true, fullScan: true, cancelAndResume: true, conflictRejected: true, exposedMethods }, null, 2));
} finally {
  await app.close();
}
