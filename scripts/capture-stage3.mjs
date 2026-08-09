import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import { _electron as electron } from 'playwright';

const projectRoot = path.resolve(import.meta.dirname, '..');
const captureData = await mkdtemp(path.join(os.tmpdir(), 'recherche-stage3-capture-'));
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
    CAREER_OPS_ROOT: process.env.RECHERCHE_CAREER_OPS_SOURCE
      || '/Users/jinyanshao/Developer/Active-正在开发的正式项目/ThirdParty-克隆的第三方项目/career-ops',
  },
});

try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.waitForFunction(() => document.querySelector('#profile-name')?.textContent === 'Jinyan Shao');
  await page.locator('.nav-item[data-section="profile"]').click();
  await page.locator('[data-route="profile-analysis"]').click();
  await page.waitForSelector('#analysis-advice .advice-row');

  const horizontalOverflow = await page.locator('#analysis-content').evaluate((root) => {
    const selectors = [
      '.analysis-score-band',
      '.analysis-section',
      '.market-columns',
      '.advice-row',
      '.positioning-preview',
      '.confirmation-bar',
    ];
    return selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)))
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
  });
  assert.deepEqual(horizontalOverflow, [], `Unexpected horizontal overflow: ${JSON.stringify(horizontalOverflow)}`);

  await page.locator('.analysis-score-band').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(projectRoot, 'stage-3-score.png'),
  });

  await page.locator('.market-section').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(projectRoot, 'stage-3-market.png'),
  });

  await page.locator('.positioning-section').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(projectRoot, 'stage-3-advice-positioning.png'),
  });
  console.log('Captured stage-3-score.png, stage-3-market.png, and stage-3-advice-positioning.png; no horizontal overflow detected.');
} finally {
  await app.close();
}
