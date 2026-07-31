import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import { _electron as electron } from 'playwright';

const projectRoot = path.resolve(import.meta.dirname, '..');
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
    CAREER_OPS_ROOT: '/Users/jinyanshao/Developer/ThirdParty-克隆的第三方项目/career-ops',
  },
});

try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.waitForFunction(() => document.querySelector('#profile-name')?.textContent === 'Jinyan Shao');
  await page.locator('.nav-item[data-view="profile"]').click();
  await page.waitForSelector('#verification-list .verification-row');
  await page.screenshot({
    path: path.join(projectRoot, 'stage-2-profile-editor.png'),
  });
  await page.locator('.verification-card').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(projectRoot, 'stage-2-verification-ledger.png'),
  });
  console.log('Captured stage-2-profile-editor.png and stage-2-verification-ledger.png');
} finally {
  await app.close();
}
