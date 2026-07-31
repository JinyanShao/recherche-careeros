import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { isScalar, isSeq, parseDocument } from 'yaml';
import type {
  AnalysisProvider,
  CareerOpsSnapshot,
  CompetitivenessAdvice,
  CompetitivenessAnalysis,
  MarketCount,
  MarketSnapshot,
  PositioningProposal,
  ScoreDimension,
  VerificationStatus,
} from './contracts';

const SWISS_TERMS = [
  'switzerland', 'swiss', 'zürich', 'zurich', 'geneva', 'genève',
  'lausanne', 'bern', 'basel', 'fribourg', 'neuchâtel', 'neuchatel',
  'zug', 'winterthur', 'lucerne', 'luzern', 'st. gallen',
];
const SENIOR_TERMS = /\b(senior|sr\.?|staff|principal|lead|head|manager|director|[5-9]\+\s*yoe)\b/i;
const ENTRY_TERMS = /\b(junior|intern(ship)?|working student|graduate|entry[- ]level|apprentice)\b/i;

function countHeadings(markdown: string, section: string): number {
  return [...sectionContent(markdown, section).matchAll(/^###\s+/gm)].length;
}

function sectionContent(markdown: string, section: string): string {
  const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = markdown.match(new RegExp(`^##\\s+${escapedSection}\\s*$`, 'im'));
  if (heading?.index === undefined) return '';
  const remainder = markdown.slice(heading.index + heading[0].length);
  const nextHeading = remainder.match(/^##\s+/m);
  return remainder.slice(0, nextHeading?.index ?? remainder.length).trim();
}

function topCounts(values: string[], limit: number): MarketCount[] {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function locationBucket(location: string): string {
  const lower = location.toLocaleLowerCase();
  if (SWISS_TERMS.some((term) => lower.includes(term))) return 'Switzerland';
  if (/\b(remote|worldwide|anywhere)\b/i.test(location)) return 'Remote / distributed';
  if (/\b(london|united kingdom|\buk\b)/i.test(location)) return 'United Kingdom';
  if (/\b(berlin|munich|germany|hamburg|frankfurt)/i.test(location)) return 'Germany';
  if (/\b(paris|france)/i.test(location)) return 'France';
  if (/\b(new york|san francisco|seattle|united states|\busa\b|washington,? dc)/i.test(location)) return 'United States';
  if (/\b(barcelona|madrid|spain)/i.test(location)) return 'Spain';
  return location.split(/[;/·]/)[0]?.trim() || 'Unspecified';
}

function sourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.includes('greenhouse')) return 'Greenhouse';
    if (host.includes('ashby')) return 'Ashby';
    if (host.includes('lever')) return 'Lever';
    if (host.includes('workday')) return 'Workday';
    if (host.includes('gem.com')) return 'Gem';
    return host.replace(/^www\./, '');
  } catch {
    return 'Local';
  }
}

function targetTerms(roles: string[]): string[] {
  const meaningful = ['backend', 'python', 'software engineer', 'software developer', 'intern', 'working student'];
  return meaningful.filter((term) => roles.some((role) => role.toLocaleLowerCase().includes(term)));
}

function isTargetMatch(title: string, terms: string[]): boolean {
  const lower = title.toLocaleLowerCase();
  return terms.some((term) => lower.includes(term));
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Strong evidence base';
  if (score >= 65) return 'Competitive foundation, visible gaps';
  if (score >= 50) return 'Promising but incomplete positioning';
  return 'Foundational work still needed';
}

function lineContaining(markdown: string, terms: string[]): string {
  return markdown.split(/\r?\n/).find((line) => (
    terms.every((term) => line.toLocaleLowerCase().includes(term.toLocaleLowerCase()))
  ))?.replace(/^[-*]\s*/, '').trim() ?? '';
}

function profileDocument(snapshot: CareerOpsSnapshot) {
  return parseDocument(snapshot.profile.content);
}

function stringAt(document: ReturnType<typeof parseDocument>, segments: string[]): string {
  const value = document.getIn(segments);
  return typeof value === 'string' ? value : '';
}

function stringArrayAt(document: ReturnType<typeof parseDocument>, segments: string[]): string[] {
  const value = document.getIn(segments, true);
  return isSeq(value)
    ? value.items.map((item) => (isScalar(item) ? String(item.value) : '')).filter(Boolean)
    : [];
}

function providerStatus(): AnalysisProvider {
  const candidates = [
    process.env.CODEX_PATH,
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  ].filter((candidate): candidate is string => Boolean(candidate));
  const executable = candidates.find((candidate) => existsSync(candidate));
  return executable
    ? {
      mode: 'evidence',
      label: '证据引擎 · 可使用增强分析',
      available: true,
      detail: executable,
    }
    : {
      mode: 'evidence',
      label: 'Evidence engine',
      available: false,
      detail: '未检测到增强分析运行时；仍可使用可解释的本地分析。',
    };
}

function marketSnapshot(snapshot: CareerOpsSnapshot): MarketSnapshot {
  const jobs = snapshot.pipeline.jobs;
  const preferred = snapshot.profileWorkspace.editor.preferredRegions.map((value) => value.toLocaleLowerCase());
  const terms = targetTerms(snapshot.profileWorkspace.editor.targetRoles);
  const now = new Date();
  const recentCutoff = new Date(now);
  recentCutoff.setUTCDate(recentCutoff.getUTCDate() - 30);
  const postedDates = jobs.map((job) => job.postedAt).filter(Boolean).sort();
  const swissMatches = jobs.filter((job) => (
    SWISS_TERMS.some((term) => job.location.toLocaleLowerCase().includes(term))
  )).length;
  const preferredRegionMatches = jobs.filter((job) => (
    preferred.some((region) => region && job.location.toLocaleLowerCase().includes(region))
  )).length;
  const recentMatches = jobs.filter((job) => {
    const date = new Date(job.postedAt);
    return !Number.isNaN(date.getTime()) && date >= recentCutoff && date <= now;
  }).length;
  const seniority = jobs.map((job) => {
    if (ENTRY_TERMS.test(job.role)) return 'Entry / student';
    if (SENIOR_TERMS.test(job.role)) return 'Senior / leadership';
    return 'Unspecified / mid-level';
  });
  return {
    sampleSize: jobs.length,
    targetRoleMatches: jobs.filter((job) => isTargetMatch(job.role, terms)).length,
    swissMatches,
    preferredRegionMatches,
    remoteMatches: jobs.filter((job) => /\bremote\b/i.test(job.location)).length,
    recentMatches,
    latestPostedAt: postedDates.at(-1) ?? '',
    topLocations: topCounts(jobs.map((job) => locationBucket(job.location)), 6),
    topCompanies: topCounts(jobs.map((job) => job.company), 6),
    seniority: topCounts(seniority, 3),
    sourceCoverage: topCounts(jobs.map((job) => sourceLabel(job.url)), 6),
    limitation: swissMatches < 5
      ? 'The Swiss subset is too small for broad market conclusions. Treat this as scanner coverage, not the full Swiss labour market.'
      : 'This is a snapshot of jobs currently present in pipeline.md, not a census of the labour market.',
  };
}

function buildDimensions(snapshot: CareerOpsSnapshot, market: MarketSnapshot): ScoreDimension[] {
  const document = profileDocument(snapshot);
  const verification = snapshot.profileWorkspace.verification;
  const statusCounts: Record<VerificationStatus, number> = {
    verified: 0,
    unverified: 0,
    needs_review: 0,
  };
  verification.forEach((item) => { statusCounts[item.status] += 1; });
  const experiences = countHeadings(snapshot.cv.content, 'Experience');
  const projects = countHeadings(snapshot.cv.content, 'Projects');
  const certifications = sectionContent(snapshot.cv.content, 'Certifications') ? 1 : 0;
  const skills = sectionContent(snapshot.cv.content, 'Skills').split(',').map((value) => value.trim()).filter(Boolean);
  const candidate = snapshot.profileWorkspace.editor;
  const links = [
    stringAt(document, ['candidate', 'linkedin']),
    stringAt(document, ['candidate', 'github']),
    stringAt(document, ['candidate', 'portfolio_url']),
  ].filter(Boolean).length;
  const projectUrls = [...snapshot.cv.content.matchAll(/https:\/\/github\.com\/[^\s)]+/gi)].length;

  const evidenceScore = Math.min(20, 8 + Math.min(statusCounts.verified, 12));
  const proofScore = Math.min(20, experiences * 2 + projects * 2 + certifications * 2 + Math.min(skills.length, 10) * 0.4);
  const marketScore = Math.min(20,
    (market.targetRoleMatches >= 10 ? 7 : market.targetRoleMatches >= 3 ? 4 : 1)
    + (market.swissMatches >= 5 ? 6 : market.swissMatches > 0 ? 3 : 0)
    + (market.recentMatches >= 10 ? 4 : market.recentMatches > 0 ? 2 : 0)
    + (market.remoteMatches > 0 ? 3 : 0));
  const discoverabilityScore = Math.min(20,
    links * 4
    + (stringAt(document, ['candidate', 'email']) ? 3 : 0)
    + (projectUrls >= 3 ? 5 : projectUrls));
  const readinessScore = Math.min(20,
    (candidate.targetRoles.length ? 4 : 0)
    + (candidate.headline ? 4 : 0)
    + (sectionContent(snapshot.cv.content, 'Summary') ? 4 : 0)
    + (candidate.location ? 2 : 0)
    + (statusCounts.unverified === 0 ? 4 : statusCounts.unverified <= 3 ? 2 : 0)
    + (candidate.compensationMinimum && candidate.compensationMinimum !== 'Not specified' ? 2 : 0));

  return [
    {
      id: 'verified-evidence', label: 'Verified evidence', score: evidenceScore, maximum: 20,
      summary: `${statusCounts.verified} verified, ${statusCounts.needs_review} awaiting review, ${statusCounts.unverified} unverified facts.`,
      evidence: ['config/profile.yml#fact_verification'],
    },
    {
      id: 'technical-proof', label: 'Technical proof', score: proofScore, maximum: 20,
      summary: `${experiences} experience entries, ${projects} projects, ${skills.length} listed skills.`,
      evidence: ['cv.md#Experience', 'cv.md#Projects', 'cv.md#Skills'],
    },
    {
      id: 'market-alignment', label: 'Observed market alignment', score: marketScore, maximum: 20,
      summary: `${market.targetRoleMatches}/${market.sampleSize} sampled jobs match target role families; ${market.swissMatches} are Swiss-located.`,
      evidence: ['data/pipeline.md'],
    },
    {
      id: 'discoverability', label: 'Recruiter discoverability', score: discoverabilityScore, maximum: 20,
      summary: `${links}/3 profile links configured; ${projectUrls} GitHub project links appear in cv.md.`,
      evidence: ['config/profile.yml#candidate', 'cv.md#Projects'],
    },
    {
      id: 'application-readiness', label: 'Application readiness', score: readinessScore, maximum: 20,
      summary: 'Measures positioning completeness and unresolved application constraints.',
      evidence: ['cv.md#Summary', 'config/profile.yml#target_roles', 'config/profile.yml#compensation'],
    },
  ].map((dimension) => ({ ...dimension, score: Math.round(dimension.score) }));
}

function buildAdvice(snapshot: CareerOpsSnapshot): CompetitivenessAdvice[] {
  const document = profileDocument(snapshot);
  const missingLinkedIn = !stringAt(document, ['candidate', 'linkedin']);
  const missingGitHub = !stringAt(document, ['candidate', 'github']);
  const missingPortfolio = !stringAt(document, ['candidate', 'portfolio_url']);
  const unverified = snapshot.profileWorkspace.verification.filter((item) => item.status !== 'verified');
  const advice: CompetitivenessAdvice[] = [
    {
      id: 'cv-proof-order', surface: 'CV', priority: 'high',
      title: 'Lead with backend proof before the career-transition context',
      detail: 'Keep the summary and first bullets focused on Python, FastAPI, SQL, APIs, tests, and deployed workflows. Do not add HEIA, work authorization, English level, or availability until verified.',
      evidence: ['cv.md#Summary', 'config/profile.yml#fact_verification'],
    },
    {
      id: 'cv-unresolved-facts', surface: 'CV', priority: unverified.length ? 'high' : 'low',
      title: 'Resolve the facts that block application tailoring',
      detail: `${unverified.length} facts are not verified. Prioritize work authorization, availability, compensation, and identity review before generating application-specific materials.`,
      evidence: unverified.slice(0, 5).map((item) => item.label),
    },
    {
      id: 'linkedin-baseline', surface: 'LinkedIn', priority: missingLinkedIn ? 'high' : 'medium',
      title: missingLinkedIn ? 'Add and verify the LinkedIn profile URL' : 'Synchronize LinkedIn with the verified career narrative',
      detail: 'Use the same role titles, dates, backend positioning, and verified metrics as cv.md. Keep unverified logistics out of the headline and About section.',
      evidence: ['config/profile.yml#candidate.linkedin', 'cv.md#Experience'],
    },
    {
      id: 'github-proof', surface: 'GitHub', priority: missingGitHub ? 'high' : 'medium',
      title: missingGitHub ? 'Confirm the GitHub profile URL in profile.yml' : 'Make the strongest backend repositories immediately scannable',
      detail: 'Pin the backend and data projects, then make each README show architecture, a reproducible demo, tests, CI, and operational limits above the fold.',
      evidence: ['cv.md#Projects', 'config/profile.yml#candidate.github'],
    },
    {
      id: 'portfolio-proof', surface: 'Portfolio', priority: missingPortfolio ? 'medium' : 'low',
      title: missingPortfolio ? 'Add a verified portfolio URL before treating it as application evidence' : 'Align portfolio case studies with target role families',
      detail: 'Each case study should connect a hiring need to a verified implementation, test evidence, deployment state, and one clear technical decision.',
      evidence: ['cv.md#Projects', 'config/profile.yml#candidate.portfolio_url'],
    },
  ];
  return advice;
}

function buildPositioning(snapshot: CareerOpsSnapshot): PositioningProposal {
  const document = profileDocument(snapshot);
  const currentHeadline = stringAt(document, ['narrative', 'headline']);
  const currentStatement = stringAt(document, ['narrative', 'exit_story']);
  const currentStrengths = stringArrayAt(document, ['narrative', 'superpowers']);
  const evidenceCandidates = [
    lineContaining(snapshot.cv.content, ['Python', 'FastAPI', 'SQL']),
    lineContaining(snapshot.cv.content, ['Automated', 'data-processing']),
    lineContaining(snapshot.cv.content, ['Partnered', 'engineering', 'business']),
  ].filter(Boolean);
  return {
    headline: currentHeadline || snapshot.profileSummary.headline,
    statement: currentStatement || sectionContent(snapshot.cv.content, 'Summary'),
    strengths: currentStrengths.slice(0, 5).map((text, index) => ({
      text,
      evidence: evidenceCandidates[index] || `config/profile.yml#narrative.superpowers[${index}]`,
    })),
  };
}

export function buildCompetitivenessAnalysis(snapshot: CareerOpsSnapshot): CompetitivenessAnalysis {
  const market = marketSnapshot(snapshot);
  const dimensions = buildDimensions(snapshot, market);
  const score = dimensions.reduce((total, dimension) => total + dimension.score, 0);
  const pipelineRevision = createHash('sha256')
    .update(JSON.stringify(snapshot.pipeline.jobs))
    .digest('hex');
  const id = createHash('sha256')
    .update(snapshot.cv.revision)
    .update(snapshot.profile.revision)
    .update(pipelineRevision)
    .update('stage3-evidence-v1')
    .digest('hex');
  return {
    id,
    generatedAt: new Date().toISOString(),
    inputRevision: {
      cv: snapshot.cv.revision,
      profile: snapshot.profile.revision,
      pipeline: pipelineRevision,
    },
    score,
    scoreLabel: scoreLabel(score),
    scoreDisclaimer: 'This is an evidence-readiness score, not a probability of being hired or a comparison with every candidate in the market.',
    dimensions,
    market,
    advice: buildAdvice(snapshot),
    positioning: buildPositioning(snapshot),
    provider: providerStatus(),
    limitations: [
      market.limitation,
      'pipeline.md contains titles and locations but not full job descriptions, so the score does not claim a skill-by-skill market match.',
      'No private LinkedIn analytics, recruiter response data, or unverified personal facts are used.',
    ],
  };
}

export function codexExecutable(analysis: CompetitivenessAnalysis): string | null {
  return analysis.provider.available ? analysis.provider.detail : null;
}
