import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AtsJob,
  AtsWorkspace,
  JobFreshness,
  JobHealth,
  JobLivenessState,
  ScanRunSummary,
} from './contracts';
import { runCareerOpsNodeScript } from './career-ops-adapter';
import { loadPortalConfig } from './portal-store';

async function readOptional(file: string): Promise<string> {
  try { return await readFile(file, 'utf8'); } catch { return ''; }
}

function table(content: string): Array<Record<string, string>> {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = lines[0].split('\t').map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const values = line.split('\t');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));
  });
}

function pipelineState(content: string): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s+(https?:\/\/\S+)/);
    if (!match) continue;
    result.set(match[2], match[1].toLowerCase() === 'x');
  }
  return result;
}

function dayAge(value: string, now = Date.now()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((now - timestamp) / 86_400_000));
}

function freshness(age: number | null): JobFreshness {
  if (age === null) return 'unknown';
  if (age === 0) return 'today';
  if (age <= 7) return 'fresh';
  if (age <= 30) return 'aging';
  return 'old';
}

function liveness(status: string): JobLivenessState {
  const normalized = status.toLowerCase();
  if (normalized.includes('expired') || normalized.includes('no_apply')) return 'expired';
  if (normalized.includes('blocked')) return 'blocked';
  if (normalized.includes('invalid')) return 'invalid';
  if (normalized === 'verified_active') return 'active';
  return 'not_checked';
}

function latestHealth(rows: Array<Record<string, string>>): Map<string, JobHealth> {
  const result = new Map<string, JobHealth>();
  rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).forEach((row) => {
    const status = row.status as JobHealth;
    result.set(row.company.toLowerCase(), [
      'reachable', 'empty', 'slug_gone', 'network', 'auth', 'server', 'unknown',
    ].includes(status) ? status : 'unknown');
  });
  return result;
}

type RepostPayload = {
  clusters?: Array<{ repostCount: number; appearances: Array<{ url: string }> }>;
};

async function repostCounts(root: string): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    const run = await runCareerOpsNodeScript(root, 'detect-reposts.mjs', []);
    if (run.code !== 0) return result;
    const payload = JSON.parse(run.stdout) as RepostPayload;
    for (const cluster of payload.clusters ?? []) {
      for (const appearance of cluster.appearances ?? []) {
        result.set(appearance.url, Math.max(cluster.repostCount, result.get(appearance.url) ?? 0));
      }
    }
  } catch {
    // Repost enrichment is optional; raw scan history remains authoritative.
  }
  return result;
}

function scanRuns(content: string): ScanRunSummary[] {
  return table(content).map((row) => {
    const filtered = Object.entries(row)
      .filter(([key]) => key.startsWith('filtered_'))
      .reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
    return {
      timestamp: row.timestamp,
      status: row.status,
      companies: Number(row.companies) || 0,
      boards: Number(row.boards) || 0,
      found: Number(row.found) || 0,
      filtered,
      duplicates: Number(row.dupes) || 0,
      added: Number(row.new_added) || 0,
      errors: Number(row.errors) || 0,
    };
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function loadAtsWorkspace(root: string): Promise<AtsWorkspace> {
  const [portals, historyText, pipelineText, healthText, runsText, reposts] = await Promise.all([
    loadPortalConfig(root),
    readOptional(path.join(root, 'data', 'scan-history.tsv')),
    readOptional(path.join(root, 'data', 'pipeline.md')),
    readOptional(path.join(root, 'data', 'portal-health.tsv')),
    readOptional(path.join(root, 'data', 'scan-runs.tsv')),
    repostCounts(root),
  ]);
  const pipeline = pipelineState(pipelineText);
  const health = latestHealth(table(healthText));
  const history = table(historyText);
  const fingerprints = new Map<string, Set<string>>();
  for (const row of history) {
    if (!row.fingerprint) continue;
    const companies = fingerprints.get(row.fingerprint) ?? new Set<string>();
    companies.add(row.normalized_company || row.company.toLowerCase());
    fingerprints.set(row.fingerprint, companies);
  }
  const byUrl = new Map<string, AtsJob>();
  for (const row of history) {
    if (!row.url) continue;
    const ageDays = dayAge(row.posted_at);
    const repostCount = reposts.get(row.url) ?? 0;
    const crossListing = Boolean(row.fingerprint && (fingerprints.get(row.fingerprint)?.size ?? 0) > 1);
    const pipelineDone = pipeline.get(row.url);
    byUrl.set(row.url, {
      id: createHash('sha256').update(row.url).digest('hex').slice(0, 16),
      url: row.url,
      company: row.company || 'Unknown company',
      role: row.title || 'Untitled role',
      location: row.location,
      provider: row.portal.replace(/-api$/i, '') || 'unknown',
      firstSeen: row.first_seen,
      postedAt: row.posted_at,
      freshness: freshness(ageDays),
      ageDays,
      scanStatus: row.status || 'added',
      liveness: liveness(row.status || 'added'),
      health: health.get((row.company || '').toLowerCase()) ?? 'not_checked',
      trustScore: row.trust_score ? Number(row.trust_score) : null,
      trustFlags: row.trust_flags ? row.trust_flags.split(',').map((item) => item.trim()).filter(Boolean) : [],
      duplicateState: crossListing ? 'cross_listing' : repostCount > 1 ? 'repost' : 'unique',
      repostCount,
      inPipeline: pipelineDone !== undefined,
      processed: pipelineDone === true,
    });
  }
  const jobs = [...byUrl.values()].sort((a, b) => (
    (b.postedAt || b.firstSeen).localeCompare(a.postedAt || a.firstSeen)
  ));
  const unhealthy = new Set(
    [...health.entries()].filter(([, status]) => !['reachable', 'empty'].includes(status)).map(([company]) => company),
  );
  return {
    loadedAt: new Date().toISOString(),
    portals,
    jobs,
    runs: scanRuns(runsText),
    totals: {
      jobs: jobs.length,
      activePipeline: jobs.filter((job) => job.inPipeline && !job.processed).length,
      fresh: jobs.filter((job) => ['today', 'fresh'].includes(job.freshness)).length,
      trustFlagged: jobs.filter((job) => job.trustScore !== null && job.trustScore < 100).length,
      reposts: jobs.filter((job) => job.duplicateState !== 'unique').length,
      unhealthyPortals: unhealthy.size,
    },
  };
}
