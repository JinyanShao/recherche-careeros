import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { parseDocument } from 'yaml';

const projectRoot = path.resolve(import.meta.dirname, '..');
const packagedExecutable = path.join(
  projectRoot,
  'out',
  'Recherche CareerOS-darwin-arm64',
  'Recherche CareerOS.app',
  'Contents',
  'MacOS',
  'Recherche CareerOS',
);
const electronExecutable = path.join(
  projectRoot,
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'MacOS',
  'Electron',
);
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'recherche-stage2-'));
console.log(`[stage2] fixture ${fixtureRoot}`);
await stat(packagedExecutable);
await Promise.all([
  mkdir(path.join(fixtureRoot, 'config'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'data'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'reports'), { recursive: true }),
]);

const profile = `# preserved profile comment
candidate:
  full_name: "Fixture Candidate"
  email: ""
  phone: ""
  location: "Fribourg, Switzerland"
target_roles:
  primary:
    - "Junior Backend Engineer"
narrative:
  headline: "Junior Backend Software Engineer"
  exit_story: "Building a software engineering career from verified backend evidence."
  superpowers:
    - "Python backend development"
    - "Automation workflows"
compensation:
  target_range: "Not specified"
  currency: "CHF"
  minimum: "Not specified"
  location_flexibility: "Not specified"
location:
  country: "Switzerland"
  city: "Fribourg"
  timezone: "Europe/Zurich"
language:
  output: en
spend_tier: standard
work_preferences:
  preferred_regions: ["Fribourg"]
  arrangements: []
  employment_types: []
  max_posting_age_days: 14
  other_requirements: []
  automatic_submission: false
fact_verification:
  schema_version: 1
  migration:
    state: completed
    source_label: "Fixture one-time import"
    source_updated_at: "2026-07-29"
    migrated_at: "2026-07-30"
    runtime_disconnected: true
  items:
    identity.name:
      label: "Name"
      category: "Identity"
      source: "config/profile.yml#candidate.full_name"
      status: verified
      evidence: "Fixture evidence"
      note: ""
`;

await Promise.all([
  writeFile(path.join(fixtureRoot, 'AGENTS.md'), '# Fixture\n'),
  writeFile(path.join(fixtureRoot, 'scan.mjs'), 'export {};\n'),
  writeFile(path.join(fixtureRoot, 'cv.md'), '# Fixture Candidate\n\n## Summary\n\nFixture summary.\n'),
  writeFile(path.join(fixtureRoot, 'config', 'profile.yml'), profile),
  writeFile(path.join(fixtureRoot, 'data', 'pipeline.md'), '# Pipeline\n'),
  writeFile(path.join(fixtureRoot, 'data', 'applications.md'), '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n'),
]);

console.log('[stage2] launching packaged app');
const app = await electron.launch({
  executablePath: electronExecutable,
  args: [
    projectRoot,
    `--user-data-dir=${path.join(fixtureRoot, 'electron-data')}`,
  ],
  env: {
    ...process.env,
    CAREER_OPS_ROOT: fixtureRoot,
  },
});
console.log('[stage2] app launched');

try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(12_000);
  page.on('console', (message) => console.log(`[renderer:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => console.log(`[renderer:error] ${error.message}`));
  console.log('[stage2] first window ready');
  await page.waitForFunction(() => document.querySelector('#profile-name')?.textContent !== '—');
  await page.locator('.nav-item[data-view="profile"]').click();
  await assert.doesNotReject(() => page.waitForSelector('#verification-list .verification-row'));
  console.log('[stage2] profile editor loaded');
  assert.equal(await page.locator('#field-full-name').inputValue(), 'Fixture Candidate');
  assert.equal(await page.locator('#migration-boundary').textContent(), '运行时已断开旧 JSON');

  await page.locator('#field-full-name').evaluate((node) => {
    const input = node;
    input.value = 'Updated Fixture Candidate';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.locator('[data-fact-id="identity.name"] select').inputValue(), 'needs_review');
  await page.getByRole('button', { name: '保存资料' }).click();
  await page.waitForFunction(() => document.querySelector('#notice')?.textContent?.includes('资料已保存'));
  console.log('[stage2] profile save verified');

  const savedProfile = await readFile(path.join(fixtureRoot, 'config', 'profile.yml'), 'utf8');
  const savedDocument = parseDocument(savedProfile);
  assert.equal(savedDocument.getIn(['candidate', 'full_name']), 'Updated Fixture Candidate');
  assert.equal(savedDocument.getIn(['fact_verification', 'items', 'identity.name', 'status']), 'needs_review');
  assert.match(savedProfile, /# preserved profile comment/);

  await page.locator('#field-headline').fill('Unsaved conflict draft');
  await writeFile(
    path.join(fixtureRoot, 'config', 'profile.yml'),
    `${savedProfile}\n# external concurrent change\n`,
  );
  await page.getByRole('button', { name: '保存资料' }).click();
  await page.waitForFunction(() => document.querySelector('#notice')?.textContent?.includes('其他进程修改'));
  console.log('[stage2] conflict rejection verified');
  assert.equal(await page.locator('#field-headline').inputValue(), 'Unsaved conflict draft');
  assert.match(
    await readFile(path.join(fixtureRoot, 'config', 'profile.yml'), 'utf8'),
    /# external concurrent change/,
  );

  await page.locator('.nav-item[data-view="cv"]').click();
  await page.locator('#cv-document').fill(`# Updated Fixture Candidate

## Summary

Updated CV.

## Experience

### Fixture Developer

- Built a fixture service.

## Projects

### Fixture API

Test fixture project.

## Skills

Python, FastAPI, SQL
`);
  await page.getByRole('button', { name: '保存 CV' }).click();
  await page.waitForFunction(() => document.querySelector('#notice')?.textContent?.includes('CV 已保存'));
  console.log('[stage2] CV save verified');
  assert.match(await readFile(path.join(fixtureRoot, 'cv.md'), 'utf8'), /Updated CV/);

  const exposedMethods = await page.evaluate(() => Object.keys(window.careerOps).sort());
  assert.deepEqual(exposedMethods, [
    'analyzeReply',
    'cancelBatch',
    'cancelScan',
    'compareApplicationMaterialVersions',
    'confirmPositioning',
    'createAiService',
    'deleteAiService',
    'evaluateJob',
    'generateApplicationMaterials',
    'getAiSettings',
    'getApplicationMaterialsWorkspace',
    'getAtsWorkspace',
    'getAutomationWorkspace',
    'getBatchStatus',
    'getCompetitivenessAnalysis',
    'getFollowupCadence',
    'getScanStatus',
    'getSnapshot',
    'listAiModels',
    'matchInvite',
    'openApplicationMaterial',
    'readReport',
    'recordOutcome',
    'runAiCompetitivenessAnalysis',
    'saveAiSettings',
    'saveCv',
    'saveDailyAutomation',
    'savePortals',
    'saveProfile',
    'seedFollowup',
    'selectAiService',
    'selectDirectory',
    'startBatch',
    'startScan',
    'testAiConnection',
    'updateTrackerStatus',
  ]);

  await page.locator('.nav-item[data-view="analysis"]').click();
  await page.waitForSelector('#analysis-advice .advice-row');
  const analysisScore = Number(await page.locator('#analysis-score').textContent());
  assert.ok(analysisScore >= 0 && analysisScore <= 100);
  assert.equal(await page.locator('#market-sample').textContent(), '0');
  const technicalProof = page.locator('.dimension-row').filter({ hasText: 'Technical proof' });
  assert.match(await technicalProof.locator('p').textContent() ?? '', /1 experience entries, 1 projects, 3 listed skills/);
  await page.locator('#positioning-confirm-checkbox').check();
  const noticeBeforePositioning = await page.locator('#notice').textContent();
  await page.getByRole('button', { name: '确认并写入' }).click();
  await page.waitForFunction((previous) => (
    document.querySelector('#notice')?.textContent !== previous
  ), noticeBeforePositioning);
  const positioningNotice = await page.locator('#notice').textContent();
  console.log(`[stage3] positioning notice: ${positioningNotice}`);
  assert.match(positioningNotice ?? '', /个人定位已确认写入/);
  const positionedProfile = parseDocument(
    await readFile(path.join(fixtureRoot, 'config', 'profile.yml'), 'utf8'),
  );
  assert.match(String(positionedProfile.getIn(['positioning_confirmation', 'analysis_id'])), /^[a-f0-9]{64}$/);
  assert.equal(positionedProfile.getIn(['narrative', 'headline']), 'Junior Backend Software Engineer');

  const backups = await readdir(path.join(fixtureRoot, 'data', 'backups', 'profile'));
  assert.equal(backups.length, 3);
  for (const backup of backups) {
    const manifest = JSON.parse(await readFile(
      path.join(fixtureRoot, 'data', 'backups', 'profile', backup, 'manifest.json'),
      'utf8',
    ));
    assert.equal(manifest.files.length, 1);
  }

  const finalSnapshot = await page.evaluate(() => window.careerOps.getSnapshot());
  const externalCv = `${fixtureRoot}-outside-cv.md`;
  await writeFile(externalCv, '# Outside file\n');
  await unlink(path.join(fixtureRoot, 'cv.md'));
  await symlink(externalCv, path.join(fixtureRoot, 'cv.md'));
  const symlinkWrite = await page.evaluate(
    (request) => window.careerOps.saveCv(request),
    {
      expectedRevision: finalSnapshot.cv.revision,
      content: '# Must not escape\n',
    },
  );
  assert.equal(symlinkWrite.ok, false);
  assert.equal(await readFile(externalCv, 'utf8'), '# Outside file\n');

  console.log(JSON.stringify({
    fixtureRoot,
    profileSaved: true,
    cvSaved: true,
    yamlCommentPreserved: true,
    conflictRejected: true,
    draftPreservedAfterConflict: true,
    backupManifestsVerified: backups.length,
    competitivenessScoreRendered: analysisScore,
    positioningConfirmedAfterUserGate: true,
    symlinkEscapeRejected: true,
    runtimeJsonDisconnected: true,
    exposedMethods,
  }, null, 2));
} finally {
  await app.close();
}
