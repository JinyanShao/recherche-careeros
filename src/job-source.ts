import { BrowserWindow, session } from 'electron';
import { lookup } from 'node:dns/promises';
import { randomUUID } from 'node:crypto';
import type { JobInputKind, JobLiveness } from './contracts';
import { runCareerOpsNodeScript } from './career-ops-adapter';

export type JobSource = {
  inputKind: JobInputKind;
  url: string;
  pageTitle: string;
  content: string;
  liveness: JobLiveness;
};

const MAX_JD_CHARACTERS = 120_000;
const MIN_JD_CHARACTERS = 200;
const NAVIGATION_TIMEOUT_MS = 30_000;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function isPrivateHostLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
  return host === 'localhost'
    || host === 'localhost.localdomain'
    || host === '::'
    || host === '::1'
    || host.startsWith('fc')
    || host.startsWith('fd')
    || host.startsWith('fe80:')
    || isPrivateIpv4(host);
}

async function validatePublicJobUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error('岗位 URL 格式无效。');
  }
  const testLoopback = process.env.RECHERCHE_TEST_ALLOW_LOOPBACK === '1';
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('岗位 URL 必须使用 HTTP 或 HTTPS。');
  if (parsed.protocol !== 'https:' && !(testLoopback && isPrivateHostLiteral(parsed.hostname))) {
    throw new Error('岗位 URL 必须使用 HTTPS。');
  }
  if (parsed.username || parsed.password) throw new Error('岗位 URL 不能包含登录凭据。');
  if (isPrivateHostLiteral(parsed.hostname) && !testLoopback) throw new Error('岗位 URL 不能指向本机或内部网络。');
  if (!testLoopback) {
    let addresses;
    try {
      addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
    } catch {
      throw new Error('岗位网站域名无法解析。');
    }
    if (!addresses.length || addresses.some(({ address }) => isPrivateHostLiteral(address))) {
      throw new Error('岗位 URL 解析到本机或内部网络，已阻止访问。');
    }
  }
  parsed.hash = '';
  return parsed;
}

function testLiveness(url: string): JobLiveness {
  return {
    status: 'active',
    code: 'test_browser_gate',
    reason: 'Visible Apply control will be verified during isolated extraction.',
    engine: 'career-ops classifier test gate',
    requestedUrl: url,
    finalUrl: url,
    extractedCharacters: 0,
  };
}

async function checkLiveness(root: string, url: string): Promise<JobLiveness> {
  if (process.env.RECHERCHE_TEST_ALLOW_LOOPBACK === '1' && isPrivateHostLiteral(new URL(url).hostname)) {
    return testLiveness(url);
  }
  const run = await runCareerOpsNodeScript(root, 'check-liveness.mjs', ['--no-fallback', url]);
  const combined = `${run.stdout}\n${run.stderr}`;
  const active = /✅\s+active/i.test(combined);
  const expired = /❌\s+expired/i.test(combined);
  const uncertain = /⚠️\s+uncertain/i.test(combined);
  const reason = combined.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^(HTTP|pattern|content|anti-bot|redirect|insufficient|visible)/i.test(line))
    ?? (active ? 'career-ops confirmed an active posting.' : 'career-ops could not confirm this posting.');
  const status = active ? 'active' : expired ? 'expired' : uncertain ? 'uncertain' : 'uncertain';
  return {
    status,
    code: active ? 'career_ops_active' : expired ? 'career_ops_expired' : 'career_ops_uncertain',
    reason,
    engine: /\(api\)/i.test(run.stdout) ? 'career-ops ATS API' : 'career-ops Playwright',
    requestedUrl: url,
    finalUrl: url,
    extractedCharacters: 0,
  };
}

async function extractWithChromium(rawUrl: string): Promise<{
  finalUrl: string;
  title: string;
  bodyText: string;
  applyControls: string[];
}> {
  const partition = `temp:recherche-job-${randomUUID()}`;
  const isolatedSession = session.fromPartition(partition, { cache: false });
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolatedSession.setPermissionCheckHandler(() => false);
  isolatedSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const candidate = new URL(details.url);
      const testLoopback = process.env.RECHERCHE_TEST_ALLOW_LOOPBACK === '1';
      const blocked = !['https:', 'http:'].includes(candidate.protocol)
        || (isPrivateHostLiteral(candidate.hostname) && !testLoopback);
      callback({ cancel: blocked });
    } catch {
      callback({ cancel: true });
    }
  });

  const browser = new BrowserWindow({
    show: false,
    webPreferences: {
      session: isolatedSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: false,
    },
  });
  browser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  browser.webContents.on('will-attach-webview', (event) => event.preventDefault());

  try {
    await Promise.race([
      browser.loadURL(rawUrl, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('岗位页面加载超时。')), NAVIGATION_TIMEOUT_MS)),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const snapshot = await browser.webContents.executeJavaScript(`(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const controls = [...document.querySelectorAll('a, button, input[type="submit"]')]
        .filter(visible)
        .map((element) => (element.innerText || element.value || element.getAttribute('aria-label') || '').trim())
        .filter(Boolean)
        .slice(0, 80);
      return {
        finalUrl: location.href,
        title: document.title || '',
        bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, ${MAX_JD_CHARACTERS}),
        applyControls: controls,
      };
    })()`);
    return snapshot as { finalUrl: string; title: string; bodyText: string; applyControls: string[] };
  } finally {
    browser.destroy();
    await isolatedSession.clearStorageData();
    await isolatedSession.clearCache();
  }
}

function verifyTestApplyControl(controls: string[]): boolean {
  return controls.some((control) => /\b(apply|postuler|bewerben|submit application)\b/i.test(control));
}

export async function loadJobSource(root: string, inputKind: JobInputKind, input: string): Promise<JobSource> {
  if (typeof input !== 'string' || input.includes('\u0000')) throw new Error('岗位输入格式无效。');
  const normalized = input.trim();
  if (inputKind === 'jd') {
    if (normalized.length < MIN_JD_CHARACTERS) throw new Error('JD 内容过短，无法进行可靠评估。');
    if (normalized.length > MAX_JD_CHARACTERS) throw new Error('JD 内容超过 120,000 字符。');
    return {
      inputKind,
      url: '',
      pageTitle: '',
      content: normalized,
      liveness: {
        status: 'not_applicable',
        code: 'pasted_jd',
        reason: '用户直接提供 JD 文本，无法验证公开页面存活状态。',
        engine: 'manual JD input',
        requestedUrl: '',
        finalUrl: '',
        extractedCharacters: normalized.length,
      },
    };
  }
  if (inputKind !== 'url') throw new Error('岗位输入类型无效。');
  const url = (await validatePublicJobUrl(normalized)).toString();
  const liveness = await checkLiveness(root, url);
  if (liveness.status !== 'active') {
    throw new Error(liveness.status === 'expired'
      ? `岗位已失效：${liveness.reason}`
      : `无法确认岗位仍然有效：${liveness.reason}`);
  }
  const extracted = await extractWithChromium(url);
  await validatePublicJobUrl(extracted.finalUrl);
  if (extracted.bodyText.length < MIN_JD_CHARACTERS) throw new Error('页面没有提取到足够的岗位正文。');
  if (process.env.RECHERCHE_TEST_ALLOW_LOOPBACK === '1' && !verifyTestApplyControl(extracted.applyControls)) {
    throw new Error('测试岗位页面没有可见 Apply 控件。');
  }
  return {
    inputKind,
    url,
    pageTitle: extracted.title,
    content: extracted.bodyText,
    liveness: {
      ...liveness,
      finalUrl: extracted.finalUrl,
      extractedCharacters: extracted.bodyText.length,
    },
  };
}
