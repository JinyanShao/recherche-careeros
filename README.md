# Recherche CareerOS

Recherche CareerOS is a local-first macOS desktop workspace for managing a complete job-search workflow. It connects to a local [`career-ops`](https://github.com/JinyanShao/career-ops) workspace and keeps candidate data, job reports, application materials, and tracking records on the user's machine.

## Current capabilities

- Edit and validate the candidate profile and CV.
- Configure OpenAI-compatible model services; API keys are encrypted with macOS secure storage.
- import a job description from text or a public URL.
- Evaluate roles with an evidence-grounded A–G report.
- Manage ATS sources and scan configured recruiting portals.
- Run concurrent batch evaluations with retries and score notifications.
- Schedule daily batch work through a macOS LaunchAgent.
- Generate and compare tailored CVs, cover letters, emails, and LinkedIn material.
- Track applications, follow-ups, recruiter replies, interviews, outcomes, and offers.

Recherche prepares and organizes application material, but it does not automatically submit applications, send messages, or publish content.

## Requirements

- macOS on Apple Silicon
- Node.js and npm
- A compatible local `career-ops` workspace
- An API key for AI-assisted evaluation and material generation

The default `career-ops` path is currently configured in `src/main.ts`. It can be overridden with `CAREER_OPS_ROOT` or selected from the application.

## Development

```bash
npm ci
npm start
```

Useful checks:

```bash
npm run typecheck
npm run lint
```

The repository also contains end-to-end verification scripts for the implemented workflow stages:

```bash
npm run verify:stage2
npm run verify:stage4
npm run verify:stage5
npm run verify:stage6
npm run verify:stage7
npm run verify:stage8
```

Some verification scripts launch Electron, bind a temporary localhost test server, and depend on a complete Electron installation plus a compatible `career-ops` checkout.

## Build

Create an unpacked application bundle:

```bash
npm run package
```

Create distributable artifacts:

```bash
npm run make
```

## Project status

Recherche CareerOS is under active development. Core workflows through application tracking are implemented, but the current repository should be treated as a development build until packaging and the full end-to-end verification suite pass on a clean macOS environment.

## Privacy and safety

- Career data remains in the selected local workspace.
- Saved API keys use Electron's macOS secure storage integration.
- Job URL ingestion rejects credentials and private-network destinations.
- Generated claims are checked against approved local evidence.
- Application submission and external messaging remain user-controlled actions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
