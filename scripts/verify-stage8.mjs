import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const projectRoot = path.resolve(import.meta.dirname, '..');
const careerOpsSource = process.env.RECHERCHE_CAREER_OPS_SOURCE
  || '/Users/jinyanshao/Developer/Active-正在开发的正式项目/ThirdParty-克隆的第三方项目/career-ops';
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'recherche-stage8-'));
const electronData = path.join(fixtureRoot, 'electron-data');
const electronExecutable = path.join(projectRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const nodeExecutable = '/Users/jinyanshao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node';

await cp(careerOpsSource, fixtureRoot, {
  recursive: true,
  filter: (source) => !['.git', 'node_modules', 'output', 'reports'].includes(path.basename(source)),
});
await symlink(path.join(careerOpsSource, 'node_modules'), path.join(fixtureRoot, 'node_modules'), 'dir');

await Promise.all([
  writeFile(path.join(fixtureRoot, 'cv.md'), '# Fixture Candidate\n\n## Summary\n\nBackend engineer.\n'),
  writeFile(path.join(fixtureRoot, 'config/profile.yml'), 'candidate:\n  full_name: Fixture Candidate\n  location: Switzerland\ntarget_roles:\n  primary: [Backend Engineer]\nlanguage:\n  output: en\n'),
  writeFile(path.join(fixtureRoot, 'data/pipeline.md'), '# Pipeline\n'),
  writeFile(path.join(fixtureRoot, 'data/applications.md'), `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-07-01 | Acme Inc | Backend Engineer | 4.4/5 | Evaluated | ❌ | — | careers: acme.com |
`),
  writeFile(path.join(fixtureRoot, 'data/follow-ups.md'), '# Follow-ups\n\n| # | App # | Date | Company | Role | Channel | Contact | Notes |\n|---|---|---|---|---|---|---|---|\n'),
]);

const app = await electron.launch({
  executablePath: electronExecutable,
  args: [projectRoot, `--user-data-dir=${electronData}`],
  env: {
    ...process.env,
    CAREER_OPS_ROOT: fixtureRoot,
    RECHERCHE_NODE_PATH: nodeExecutable,
    RECHERCHE_TEST_ALLOW_UNVERIFIED_CAREER_OPS: '1',
  },
});

try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(90_000);
  await page.waitForFunction(() => document.querySelector('#profile-name')?.textContent === 'Fixture Candidate');
  const names = await page.evaluate(() => Object.keys(window.careerOps));
  for (const name of ['updateTrackerStatus', 'seedFollowup', 'getFollowupCadence', 'analyzeReply', 'matchInvite', 'recordOutcome']) {
    assert.ok(names.includes(name), `${name} must be exposed through preload`);
  }
  assert.equal(names.some((name) => /send|publish|submit|applyApplication/i.test(name)), false);

  const applied = await page.evaluate(() => window.careerOps.updateTrackerStatus({ rowNumber: '1', status: 'Applied', note: 'Application sent 2026-07-31' }));
  assert.equal(applied.ok, true);
  assert.equal(applied.snapshot.tracker.applications[0].status, 'Applied');
  await page.evaluate(() => window.careerOps.seedFollowup('1'));
  assert.match(await readFile(path.join(fixtureRoot, 'data/follow-ups.md'), 'utf8'), /next #1/);
  const cadence = await page.evaluate(() => window.careerOps.getFollowupCadence());
  assert.equal('error' in cadence, false);

  const reply = await page.evaluate(() => window.careerOps.analyzeReply({
    from: 'recruiter@acme.com', subject: 'Your job offer', body: 'We are pleased to offer you the Backend Engineer position at Acme Inc.',
  }));
  assert.equal(reply.classification.type, 'Offer');
  assert.equal(reply.match.applicationNumber, '1');
  assert.equal(reply.canApplySuggestedStatus, true);
  assert.match(await readFile(path.join(fixtureRoot, 'data/reply-candidates.json'), 'utf8'), /recruiter@acme\.com/);
  const offered = await page.evaluate(() => window.careerOps.updateTrackerStatus({ rowNumber: '1', status: 'Offer', note: 'Confirmed after reply review' }));
  assert.equal(offered.snapshot.tracker.applications[0].status, 'Offer');

  const invite = await page.evaluate(() => window.careerOps.matchInvite('Company: Acme Inc\nInterview with Acme Inc for Backend Engineer\n2026-08-05'));
  assert.equal(invite.candidates[0]?.appNumber, 1);
  const outcome = await page.evaluate(() => window.careerOps.recordOutcome({ rowNumber: '1', outcomeType: 'offer_received', stage: 'Written offer', feedback: 'Offer received and saved for review.' }));
  assert.equal(outcome.snapshot.tracker.applications[0].status, 'Offer');

  await page.locator('.nav-item[data-section="applications"]').click();
  await page.waitForSelector('.lifecycle-grid');
  await page.locator('#tracker-status-row').selectOption('1');
  await page.locator('#tracker-status-value').selectOption('Offer');
  await page.getByRole('button', { name: '确认更新状态' }).click();
  const confirmation = page.locator('#confirmation-dialog');
  await page.waitForFunction(() => document.querySelector('#confirmation-dialog')?.hasAttribute('open'));
  assert.equal(await confirmation.getAttribute('label'), '更新申请状态');
  await page.getByRole('button', { name: '确认更新', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#notice')?.textContent?.includes('状态已更新'));
  await page.screenshot({ path: path.join(projectRoot, 'stage-8-tracker-lifecycle.png'), fullPage: true });
  console.log(JSON.stringify({ fixtureRoot, statusUpdate: true, followupSeed: true, replySuggestionOnly: true, inviteMatch: true, outcomeArchive: true, confirmationDialog: true }));
} finally {
  await app.close();
  await rm(fixtureRoot, { recursive: true, force: true });
}
