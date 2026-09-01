import { appendFileSync, mkdirSync } from 'node:fs';

mkdirSync('data', { recursive: true });
const now = new Date().toISOString();

appendFileSync(
  'data/scan-runs.tsv',
  `${now}\tcompleted\t2\t0\t2\t2\t0\t0\t0\t0\t0\t0\t1\t1\t0\t0\t0\t0\t0\n`,
);

appendFileSync(
  'data/pipeline.md',
  '- [ ] https://example.com/jobs/demo-platform | Demo Systems | Platform Engineer | Lausanne, Switzerland | CHF 90k-110k | posted:2026-08-24 | trust:91\n',
);

console.log('Demo scan complete: added one synthetic job to data/pipeline.md');
