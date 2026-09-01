import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import { _electron as electron } from 'playwright';
import { requiredCareerOpsSource } from './env.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const careerOpsSource = requiredCareerOpsSource('capture-stage2');
const captureData = await mkdtemp(path.join(os.tmpdir(), 'recherche-stage2-capture-'));
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
const app = await electron.launch({
  executablePath: electronExecutable,
  args: [
    projectRoot,
    `--user-data-dir=${captureData}`,
  ],
  env: {
    ...process.env,
    CAREER_OPS_ROOT: careerOpsSource,
  },
});

try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.waitForFunction(() => document.querySelector('#profile-name')?.textContent === 'Jinyan Shao');
  await page.locator('.nav-item[data-section="profile"]').click();
  await page.waitForSelector('#verification-list .verification-row');
  await page.screenshot({
    path: path.join(projectRoot, 'stage-2-profile-editor.png'),
  });
  await page.locator('.verification-card').evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({
    path: path.join(projectRoot, 'stage-2-verification-ledger.png'),
  });
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.locator('.verification-card').evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({
    path: path.join(projectRoot, 'stage-2-verification-ledger-1040.png'),
  });
  console.log('Captured stage-2 profile and verification views at desktop and minimum window sizes');
} finally {
  await app.close();
}
