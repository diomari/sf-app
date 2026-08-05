# Salesforce Account Management App

Greenfield AWS staging application for authenticated Salesforce Account search, 50-record cursor pagination, creation, update, and confirmed deletion. Salesforce remains the sole Account system of record.

## Project status

Milestones 1 and 2 provide the workspace foundation, explicit Account contracts, and Hono API shell. Salesforce connectivity, authentication, Account routes, and deployable application resources are intentionally deferred to later milestones. Nothing has been deployed.

## Start here

- [Technical implementation specification](salesforce-account-app-technical-implementation.md)
- [Implementation plan](docs/implementation-plan.md)
- [Architecture decision log](docs/architecture/decision-log.md)
- [Security baseline](SECURITY.md)
- [Coding-agent instructions](AGENTS.md)
- [Contributing](CONTRIBUTING.md)

## Local verification

Use Node.js 22.22.0 and pnpm 10.28.0:

```bash
pnpm install --frozen-lockfile
pnpm verify
```

Focused commands are available as `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm cdk:synth`. CDK synthesis creates only the empty staging foundation stack in `ap-southeast-1`; it does not deploy.

Do not configure real secrets, connect to Salesforce, or deploy resources without explicit approval for the applicable later milestone.
