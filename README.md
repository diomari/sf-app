# Salesforce Account Management App

Greenfield AWS staging application for authenticated Salesforce Account search, 50-record cursor pagination, creation, update, and confirmed deletion. Salesforce remains the sole Account system of record.

## Project status

Milestones 1, 2, 3, 6, and 7 are scaffolded: the workspace foundation, explicit Account contracts, Hono API shell, a mocked-and-tested Salesforce Client Credentials auth client, the staging AWS infrastructure (Cognito, API Gateway, CloudFront, S3) as CDK code, and a Cognito-authenticated Account UI built against a mock API. The `/api/accounts` routes themselves (Milestone 4/5) are not implemented yet, so the frontend and backend cannot be connected end to end, and nothing has been deployed.

## Start here

- [Technical implementation specification](salesforce-account-app-technical-implementation.md)
- [Implementation plan](docs/implementation-plan.md)
- [Architecture decision log](docs/architecture/decision-log.md)
- [Security baseline](SECURITY.md)
- [Coding-agent instructions](AGENTS.md)
- [Contributing](CONTRIBUTING.md)

## Prerequisites

- Node.js `22.22.0` and pnpm `10.28.0` (pinned in `package.json#engines` and enforced by `engine-strict=true` in `.npmrc`). Use `nvm install` / `nvm use` with the repo's `.nvmrc`, or otherwise match this exact version — a newer Node fails `pnpm install`/scripts outright.
- No AWS account, Salesforce org, or real credentials are required for anything below. Do not add real secrets, connect to Salesforce, or deploy AWS resources without the explicit approval `AGENTS.md` requires.

## Install

```bash
pnpm install --frozen-lockfile
```

## Verify everything (what CI runs)

```bash
pnpm verify
```

Runs lint, format check, typecheck, tests with coverage, builds, and `cdk synth` across every workspace package in sequence. Each step is also available on its own:

```bash
pnpm lint         # eslint across the whole repo
pnpm format:check # prettier --check
pnpm typecheck    # tsc --noEmit in every package
pnpm test         # vitest run --coverage in every package
pnpm build        # compile/bundle every package
pnpm cdk:synth    # synthesize the staging CDK stack (no deployment)
```

Scope any of these to a single package with `pnpm --filter <package-name> <script>`, e.g. `pnpm --filter @salesforce-account-app/api test`. Package names: `@salesforce-account-app/shared`, `@salesforce-account-app/api`, `@salesforce-account-app/web`, `@salesforce-account-app/infrastructure`.

## Run the frontend locally

```bash
cp .env.example apps/web/.env.local   # then fill in placeholder VITE_* values as needed
pnpm --filter @salesforce-account-app/web dev
```

Starts the Vite dev server (default `http://localhost:5173`). The Cognito pool and `/api/*` routes don't exist yet (Milestones 4–6 aren't deployed), so the UI's sign-in and Account calls will fail against the placeholder `.env.example` values — that's expected until a real staging environment exists. To exercise the UI's actual behavior today, run its test suite instead, which drives every screen against a contract-shaped mock API server:

```bash
pnpm --filter @salesforce-account-app/web test
```

## Run the backend

There is no standalone local API server yet — `apps/api` currently exports only a Lambda handler (`hono/aws-lambda`) plus the `/api/health` route and the not-yet-wired Salesforce auth client; the Account routes it will eventually serve are Milestone 4/5 work. Exercise what exists via its test suite, which runs the real Hono app in-memory against mocked Salesforce responses:

```bash
pnpm --filter @salesforce-account-app/api test
```

## Infrastructure

```bash
pnpm --filter @salesforce-account-app/infrastructure cdk:synth
```

Synthesizes the staging Cognito/API Gateway/CloudFront/S3 stack in `ap-southeast-1` to `infrastructure/cdk.out/` for inspection — it does not deploy or touch any real AWS account. Deployment requires explicit approval per `AGENTS.md`.
