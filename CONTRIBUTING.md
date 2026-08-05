# Contributing

## Before implementation

Read `AGENTS.md`, `docs/implementation-plan.md`, `docs/architecture/decision-log.md`, and `SECURITY.md`. Work only on an approved milestone and do not resolve open architecture decisions silently.

## Local baseline

Milestone 1 will pin Node and pnpm versions and create the workspace commands. Once available, a change is expected to pass:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm cdk:synth
pnpm verify
```

Real Salesforce integration tests must be opt-in, must use an approved sandbox and disposable records, and must never run from an untrusted pull request.

## Pull requests

Keep pull requests aligned to one milestone or vertical slice. Include:

- requirement and decision-log references;
- behavior and architecture summary;
- security/data-flow impact;
- test evidence and commands;
- CDK diff and IAM changes when applicable;
- screenshots/accessibility evidence for UI changes;
- deployment/rollback notes;
- residual risk and deferred work.

Independent review is required for identity, OAuth, IAM, Salesforce permissions, CloudFront/API caching, network topology, secrets, throttles/concurrency, and staging deployment changes.

## Deployment safety

Pull requests must not deploy. The single staging environment uses an approved, staging-scoped CI role with short-lived credentials and an explicit deployment approval gate. Production deployment and promotion are out of scope. Never run destructive CDK operations without explicit approval and a reviewed cleanup/retention plan.
