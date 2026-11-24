# Contributing

Thanks for helping improve Insightful. Keep it simple: small, focused pull requests that pass the checks below.

## Setup

```bash
npm install
npm run dev        # http://localhost:3000
```

Node.js 20+ is recommended. For LLM/database features, copy `.env.example` to `.env.local` (see [Technical spec — Connection configuration](./TECHNICAL_SPEC.md#connection-configuration)). No credentials are needed for the curated use cases, and `npm run mock:llm` provides a local OpenAI-compatible provider for agent work.

## Before you open a PR

Run all four — they are the same checks CI expects:

```bash
npm test           # vitest
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run build      # next build
```

## Guidelines

- **Keep PRs small and single-purpose.** One fix or feature per PR, with a short description of what changed and why.
- **Add tests for behavior you introduce or fix.** Put them next to the existing tests; don't chase coverage.
- **Update the docs.** [README.md](./README.md) covers what the product does; [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) covers configuration, agent behaviour, limits and deployment.
- **Never commit secrets.** Credentials belong in `.env.local` (gitignored) or the Configuration page, not in code or fixtures.
- **Match the existing style.** TypeScript, App Router conventions, Tailwind v4; let `eslint` be the arbiter.

## Where things live

```
src/lib/data/        datasets plus the HK snapshot
src/lib/engine/      parse.ts (question → interpretation), analyze.ts (→ report), stats.ts
src/lib/usecases.ts  personas and curated questions
src/components/      workspace, ask bar, report card, chart renderer, store
src/app/             workspace, /dashboard, /datasets, /config, /api/insight, /api/config
```

## Reporting issues

Issues are tagged as **enhancement** or **bug** only — pick the one that fits; no other labels are used. Open a GitHub issue with steps to reproduce, the question/use case involved, and what you expected versus what happened. For provider or database problems, include the error details shown in the UI (never your credentials).
