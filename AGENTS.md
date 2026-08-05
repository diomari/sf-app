# Coding Agent Instructions

This file is the authoritative repository-wide instruction set for coding agents.

## Read first

Before changing code, read:

1. `salesforce-account-app-technical-implementation.md`
2. `docs/implementation-plan.md`
3. `docs/architecture/decision-log.md`
4. `SECURITY.md`
5. the nearest nested `AGENTS.md`, if one is added later

If documents conflict, stop and report the conflict. Approved ADRs/decision-log entries supersede proposals; the technical specification defines product scope; security invariants in this file and `SECURITY.md` are mandatory.

## Architecture invariants

- Salesforce is the only Account system of record. Do not add DynamoDB, RDS, local Account persistence, response caching, or background synchronization.
- Keep Salesforce credentials and access tokens server-side. Never expose them through frontend configuration, API responses, logs, tests, fixtures, or build output.
- Do not accept SOQL, Salesforce object names, field lists, instance URLs, or `nextRecordsUrl` from the browser.
- Use explicit DTOs, strict schemas, allowlisted fields, fixed SOQL, and normalized errors.
- Only `/api/health` is public. Every other route requires the approved Cognito access-token scope.
- Do not weaken Cognito, API Gateway, IAM, CORS, CSP, CloudFront, S3, throttling, timeout, or log-redaction controls to make development easier.
- Do not automatically retry create, update, or delete after an ambiguous failure. An explicit Salesforce `401` may trigger one token refresh and one replay according to the approved client policy.
- Treat the shared Salesforce integration user as a privileged trust boundary. Do not invent per-user authorization behavior.
- Keep AWS code in `infrastructure` or adapters and Salesforce-specific behavior in `apps/api`.

## Greenfield workflow

1. Work on one approved milestone from `docs/implementation-plan.md` at a time.
2. Inspect the current repository and decision log before editing.
3. State assumptions and list planned files. Do not silently decide unresolved Gate 0 items.
4. Implement the smallest complete vertical slice with its tests.
5. Run focused tests, then root lint, typecheck, test, build, and CDK synth as applicable.
6. Review changed code for secrets, sensitive logs, unsafe retries, unbounded work, and accidental scope expansion.
7. Update documentation and the decision log when behavior or an approved decision changes.

## Approval boundaries

Explicit human approval is required before:

- deploying or destroying AWS resources;
- reading, creating, rotating, or changing real secrets;
- connecting to or mutating a real Salesforce org;
- changing IAM, Cognito, OAuth scopes, Salesforce permissions, network topology, domains, staging retention/removal policies, throttles, or reserved concurrency;
- adding persistence, queues, caches, roles, operations beyond the approved search/list/create/update/delete scope, or new Account fields;
- introducing a major dependency or changing the package manager/runtime baseline.

Never use real customer Account data in tests or fixtures.

## Coding standards

- TypeScript strict mode; avoid `any`, unchecked casts, and non-null assertions.
- Prefer small pure mapping/validation functions and dependency injection at I/O boundaries.
- Reject unknown request keys and validate at runtime. Frontend validation is never a security boundary.
- Use typed application errors and stable public error codes. Preserve safe causes internally without returning raw upstream bodies.
- Use abortable outbound requests and explicit timeouts.
- Log structured metadata only. Do not log authorization headers, tokens, secrets, private keys, full request/response bodies, or Account field values.
- Tests must be deterministic and use mocks by default. Mark real integration tests clearly and require opt-in configuration.
- Preserve unrelated user changes; never rewrite or delete work to simplify a task.

## Expected repository commands

Once Milestone 1 establishes them, use:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm cdk:synth
pnpm verify
```

If a command does not yet exist, report that fact; do not claim it passed.

## Required handoff

Every coding task report must include:

- milestone/requirement addressed;
- changed files and concise rationale;
- tests and commands run with outcomes;
- security and data-handling checks performed;
- assumptions/decisions made;
- unresolved risks or blockers;
- confirmation that no deployment or real-data operation occurred, unless explicitly approved.
