# Salesforce Account App — Implementation Plan

**Status:** Proposed for approval  
**Source:** [`../salesforce-account-app-technical-implementation.md`](../salesforce-account-app-technical-implementation.md)  
**Delivery approach:** Security-first, incremental vertical slices  
**System of record:** Salesforce; no application database

## 1. Outcome

Deliver a production-ready web application in which approved Cognito users can list, create, and update Salesforce Accounts through a typed Hono API deployed on AWS. The implementation must remain stateless, least-privileged, observable, and bounded so AWS concurrency cannot overwhelm Salesforce.

## 2. Architectural principles

1. **Salesforce remains authoritative.** Do not persist Account data in AWS databases, logs, caches, analytics, or browser service workers.
2. **Authenticate at the edge; authorize explicitly.** API Gateway validates signature, issuer, client/audience, expiry, and an API-specific OAuth scope. Requiring the scope is the control that excludes Cognito ID tokens; deployed tests must prove this. Lambda applies any future business authorization.
3. **Use one production topology.** CloudFront serves the private-S3 frontend and proxies `/api/*` to an API Gateway custom domain. Disable the default `execute-api` endpoint so callers cannot bypass CloudFront. API responses are never cached. This provides a same-origin browser experience.
4. **Expose application contracts, not Salesforce internals.** Fixed SOQL, allowlisted fields, strict schemas, normalized errors, and DTO mapping are mandatory.
5. **Fail closed and bound work.** Timeouts, payload limits, throttles, reserved concurrency, list limits, and non-retry rules protect Salesforce and cost.
6. **Use least privilege throughout.** Separate AWS environments, one-secret IAM access, scoped deployment roles, a dedicated Salesforce integration user, and explicit field-level permissions.
7. **Make operations observable without exposing data.** Structured metadata-only logs, metrics, alarms, request correlation, and safe audit events.
8. **Deploy verified immutable artifacts.** CI validates each artifact. The baseline uses a documented, approval-gated deployment that reuses the staging-verified artifact with short-lived credentials; complex promotion orchestration remains out of scope.

## 3. Target architecture

```text
Browser
  ├── /, /assets/* ──> CloudFront ──OAC──> private S3
  ├── Cognito redirect <───────────────> Cognito Managed Login
  └── /api/* ────────> CloudFront (cache disabled)
                          └──> API Gateway custom domain
                                 └── HTTP API (default endpoint disabled)
                                 ├── JWT authorizer + required API scope
                                 ├── route throttling/access logs
                                 └──> Lambda alias ──> Hono
                                         ├──> Secrets Manager (one ARN)
                                         ├──> Salesforce OAuth
                                         └──> Salesforce REST API

CloudWatch: logs, metrics, alarms, dashboard
CloudTrail: control-plane audit
```

### Environment topology

- `local`: mocked Salesforce by default; optional approved sandbox access.
- `staging`: separate Cognito pool, secret, CloudFront distribution, Lambda/API, and Salesforce sandbox.
- `production`: separate AWS account preferred; separate Cognito pool and secret required; Salesforce production integration user.
- Never share Cognito users, Salesforce secrets, or writable Salesforce principals across staging and production.

## 4. Gate 0 — decisions required before feature implementation

Record each decision in [`architecture/decision-log.md`](architecture/decision-log.md). Block affected work until an owner approves it.

| ID | Decision | Recommended default | Owner |
|---|---|---|---|
| D-01 | AWS accounts, region, CloudFront/API domains, certificates, and direct-origin exposure | Separate staging/production accounts; stable custom domains; disable the default API endpoint | Platform |
| D-02 | Expected Account volume, user count, peak requests, and Salesforce quotas | Measure and set numeric limits before deploy | Product + Salesforce |
| D-03 | List behavior | Baseline returns latest 100 plus `meta.limit`/`meta.truncated`; cursor pagination requires scope approval | Product |
| D-04 | `parentId` contract and lookup/access UX | Retain it in the baseline API contract per the source specification; confirm safe UI behavior before implementation | Product + Salesforce |
| D-05 | PATCH/null semantics | Omitted = unchanged; explicit `null` = clear when field permits; reject empty PATCH | API owner |
| D-06 | Concurrent updates | Use Salesforce conditional update and return `412 PRECONDITION_FAILED` | Product + Salesforce |
| D-07 | Create idempotency | Do not retry ambiguous writes; use an approved External ID if duplicates are unacceptable | Product + Salesforce |
| D-08 | Salesforce auth mode | Explicit deployment-time `client_credentials` or `jwt_bearer`; never runtime fallback | Salesforce security |
| D-09 | Cognito policy | Admin-only provisioning, self-sign-up off, MFA required in production | Security |
| D-10 | Browser token storage | In-memory/session-oriented storage with reviewed OIDC library; document refresh behavior | Security + frontend |
| D-11 | API OAuth scope | Cognito resource server scope `accounts-api/access` required on protected routes | Security |
| D-12 | Salesforce source IP restriction | If required, approve VPC/NAT/static egress cost and design before CDK | Platform + Salesforce |
| D-13 | SLOs and support | Define availability, latency, alert recipients, RTO, and support hours | Product + operations |
| D-14 | Production resource retention/removal policy | Retain logs/secrets and protect security-critical resources; define approved cleanup | Platform + security |

### Source-spec clarifications to carry into implementation

- Create requires a nonblank `name`; PATCH permits omission of `name` but rejects an empty body.
- Add `INTEGRATION_FORBIDDEN` consistently or map it to the approved public code table.
- `not_configured` is valid for integration status; Account routes return controlled `503`.
- JWT Bearer secret configuration needs `authMode`, username, audience/login URL, and private key.
- Cognito JWT tests must reject ID tokens, wrong issuer/audience/client, missing scope, and expired tokens.
- The static frontend is publicly downloadable; authentication protects application data and API operations.

## 5. Delivery roadmap

Each milestone is independently reviewable. Do not begin the next milestone until its exit gate is met or an explicit exception is recorded.

### Milestone 1 — Repository and quality foundation

**Deliverables**

- pnpm workspace with `apps/web`, `apps/api`, `packages/shared`, and `infrastructure`.
- Pinned Node and pnpm versions, lockfile, strict TypeScript base config, ESLint, formatting, Vitest, and coverage.
- Root scripts: `lint`, `typecheck`, `test`, `build`, `cdk:synth`, and `verify`.
- CI skeleton, dependency update policy, secret scan, and IaC scan.
- Documentation and agent governance files.

**Exit gate**

- A clean checkout can run frozen install and all root quality commands.
- Generated files, credentials, keys, environment files, CDK output, coverage, and build output are ignored.
- No deployment credentials are stored in the repository.

### Milestone 2 — Shared contracts and API shell

**Deliverables**

- Shared success/error envelopes and explicit Account DTOs.
- Strict create and PATCH schemas with field lengths, numeric bounds, URL schemes, Salesforce ID validation, unknown-field rejection, body-size limits, and approved null semantics.
- Hono app factory with dependency injection, request context, safe request ID generation, global error handling, and `/api/health`.
- Structured logging with central redaction.

**Exit gate**

- Contract and API tests cover malformed JSON, oversized payloads, unknown/read-only fields, malicious request IDs, and stable error responses.
- Log-capture tests prove that authorization headers, tokens, secrets, full bodies, and Account field values are absent.

### Milestone 3 — Salesforce authentication and resilient client

**Deliverables**

- Secrets provider restricted to one secret ARN; discriminated schema for the selected auth mode.
- Salesforce host allowlist validation for login and returned instance URLs.
- Module-memory token cache with safety skew and single-flight token acquisition.
- Bounded HTTP client with abort support and normalized upstream errors.
- One token-refresh replay after an explicit Salesforce `401`, including a write because Salesforce rejected it before processing. Never retry a create/update after a timeout, network failure, `429`, or `5xx`, where the write outcome may be ambiguous.

**Exit gate**

- Unit tests cover token acquisition concurrency, expiry, invalid/rotated secrets, host rejection, timeouts, `401` replay, and non-retry rules.
- Before any real sandbox call, Salesforce and data owners approve and record the connected-app OAuth policy, Account object CRUD, writable/readable fields, sharing/record visibility, and the shared-principal risk.
- Only after that approval, the integration user authenticates against the staging Salesforce sandbox.

### Milestone 4 — Read-only vertical slice

**Deliverables**

- Server-owned fixed SOQL and Salesforce-to-application mapping.
- `GET /api/accounts` with an explicit limit/truncation contract.
- Bounded `GET /api/integration/status` semantics; never expose raw failures or poll continuously from the UI.
- API response headers include `Cache-Control: no-store`.

**Exit gate**

- Mocked integration tests pass for success, `401`, `403`, `429`, `5xx`, and timeout.
- A staging sandbox test lists Accounts without exposing SOQL, tokens, or raw Salesforce payloads.
- Data owner confirms the shared-integration-user visibility model.

### Milestone 5 — Create and update

**Deliverables**

- Explicit application-to-Salesforce write mapping.
- `POST /api/accounts` and nonempty `PATCH /api/accounts/:id`.
- Approved null-clearing, concurrency, and idempotency behavior.
- Safe audit event: Cognito `sub`, action, Account ID where known, outcome, and request ID—never full payload values.

**Exit gate**

- Tests cover Salesforce validation rules, missing records, permission errors, conflicts, rate limits, timeout ambiguity, and accidental retry prevention.
- Staging tests create and update a disposable Account and confirm Salesforce is authoritative.

### Milestone 6 — Secure AWS infrastructure

**Deliverables**

- Cognito with self-sign-up disabled, exact callbacks/logout URLs, PKCE `S256`, API resource server/scope, approved MFA/password/token settings, and secretless SPA client.
- API Gateway JWT authorizer with protected-by-default routes; only health is public.
- Numeric route throttles, payload limits, access logging, Lambda timeout/memory/reserved concurrency, alias, and least-privilege IAM.
- Private encrypted S3 with Block Public Access and CloudFront OAC; never S3 website hosting.
- CloudFront `/api/*` behavior forwards authorization and required request data, allows API methods, disables caching, and cannot be rewritten by SPA fallback; API Gateway uses an approved custom domain and disables its default endpoint.
- TLS-only, modern TLS policy, security response headers, immutable asset caching, and short/no-cache `index.html`.
- Explicit log retention/encryption and production removal/termination policies.

**Exit gate**

- CDK assertions and `cdk-nag` checks pass.
- ID tokens and incorrectly scoped access tokens are rejected in a deployed test.
- Protected routes return `401` without a valid access token; health remains public.
- S3 objects are inaccessible directly, API responses are not cached, and a deployed request to the default API endpoint is rejected.

### Milestone 7 — Cognito frontend and Account UI

**Deliverables**

- Reviewed OIDC/PKCE library integration with state/nonce handling, callback cleanup, token expiry handling, logout, and protected rendering.
- Typed API client that attaches the access token and maps standard errors.
- Accessible responsive table, create/update form, field-level validation, clear loading/empty/error/success states, and list-limit disclosure.
- External website links restricted to safe schemes and rendered with `noopener noreferrer`.

**Exit gate**

- Component/integration tests cover redirect, callback, logout, token attachment/expiry, list, create, update, clear-field behavior, conflict refresh, keyboard use, and responsive layout.
- No Salesforce endpoint, credential, or token appears in frontend source or artifacts.

### Milestone 8 — Observability, capacity, and security validation

**Deliverables**

- Dashboard and alarms for API 4xx/5xx/429, Lambda errors/throttles/duration/concurrency, Salesforce status classes/latency, Cognito sign-in anomalies, and budget thresholds.
- Numeric capacity envelope documenting API Gateway throttles, Lambda reserved concurrency, request/response limits, Salesforce timeouts, API quotas, and expected peak load.
- Threat model, incident/runbook documentation, secret rotation, user offboarding, quota exhaustion, Salesforce outage, and rollback procedures.
- Low-volume load test constrained to avoid production Salesforce impact.

**Exit gate**

- Security review approves trust boundaries, IAM, auth flows, CSP, data handling, and logs.
- Load evidence shows configured limits protect Salesforce and meet approved SLOs.
- Alarm delivery and at least one failure runbook are exercised.

### Milestone 9 — CI/CD and release readiness

**Deliverables**

- PR workflow: frozen install, lint, typecheck, unit/integration tests, coverage, builds, CDK synth/assertions, dependency audit, secret scan, and IaC scan.
- Deployment via GitHub OIDC or equivalent short-lived credentials; no long-lived AWS keys.
- Immutable staging deployment, smoke test, manual/approval-gated reuse of the same verified artifact in production, and documented rollback. Do not build a complex promotion pipeline in the baseline.
- Setup, deployment, release, rollback, and cleanup documentation.

**Exit gate**

- A failing required check blocks merge.
- An independent operator follows the docs from clean checkout through staging deployment.
- Production acceptance verifies login, invalid-token rejection, list/create/update, Salesforce consistency, no database, log redaction, alarms, and rollback.

## 6. Security control baseline

### Identity and authorization

- Cognito self-sign-up off; admin-approved user lifecycle.
- MFA required for production unless security records a time-bound exception.
- Require an API-specific OAuth scope to prevent an ID token being accepted as API authorization.
- Validate exact issuer and audience; rely on API Gateway for signature/expiry validation and deployed negative tests for configuration correctness.
- Shared Salesforce-principal risk requires written data-owner acceptance. If users need different record visibility, stop and redesign authorization.

### Secrets and network

- Create secret values out of band; never pass secret material through CDK context, CloudFormation parameters, frontend variables, or CI logs.
- Lambda reads one secret ARN and, if applicable, decrypts with one KMS key.
- Permit only approved HTTPS Salesforce/My Domain hosts and reject redirects to unexpected hosts.
- Use VPC/NAT only if static egress or another explicit network requirement justifies its cost and operational burden.

### Application and data

- Fixed queries, allowlisted writable fields, strict schemas, bounded strings/numbers, safe URL schemes, and body-size limits.
- No raw SOQL, Salesforce field selection, object name, `nextRecordsUrl`, token, or raw upstream error crosses the API boundary.
- No Account responses in CloudFront caches, service-worker caches, logs, tracing payloads, or analytics.
- Do not retry ambiguous writes automatically. Use preconditions for updates when approved.

### Supply chain and delivery

- Pin runtime/package-manager versions and commit the lockfile.
- Dependabot/Renovate plus dependency, secret, and IaC scanning.
- Branch protection, required review for identity/IAM/infrastructure/security changes, and artifact provenance retained by CI.
- Use short-lived OIDC deployment roles scoped by environment.

## 7. Scalability and reliability envelope

The app is stateless, but Salesforce is the limiting dependency. Gate 0 must turn the following into numeric settings:

- Account list limit and maximum serialized response size.
- API Gateway per-route rate/burst limits.
- Lambda reserved concurrency, memory, timeout, and maximum event size.
- Salesforce connect/response timeout shorter than Lambda timeout, with abort before Lambda deadline.
- Salesforce daily API and concurrent-request budgets allocated to this app.
- CloudWatch log ingestion and AWS budget alarms.

Scale changes follow this order: optimize request count and payload size, tune Lambda memory, adjust throttles/concurrency within Salesforce quotas, then request quota changes. Do not add a database or data cache as a scaling shortcut without a new architecture decision.

## 8. Verification strategy

| Layer | Required evidence |
|---|---|
| Shared contracts | Schema and mapping unit tests; compile-time DTO separation |
| API | Hono request tests with mocked Salesforce and log-capture assertions |
| Integration | Controlled Salesforce sandbox list/create/update tests |
| Frontend | Component tests plus user-level auth and Account flows |
| Infrastructure | CDK assertions, synth, `cdk-nag`, least-privilege review |
| Security | Negative JWT tests, secret scan, dependency scan, threat-model review |
| Capacity | Bounded staging load test and quota/concurrency evidence |
| Release | Automated smoke test and independently executed rollback |

No production test may create or update records without an approved test-data procedure.

## 9. Work ownership and review

- **Product owner:** field scope, record limit, conflict/idempotency UX, acceptance.
- **Salesforce owner:** connected app, integration user, sharing/FLS, validation rules, API quotas.
- **Security owner:** Cognito settings, scope design, threat model, secrets, audit controls.
- **Platform owner:** AWS accounts, CDK, domains, alarms, deployment roles, cost controls.
- **Engineering owner:** contracts, application implementation, automated tests, documentation.

Identity, IAM, Salesforce permissions, CloudFront behavior, and production deployment require independent review.

## 10. Definition of done

The project is complete only when:

- all Gate 0 decisions are approved and recorded;
- all milestone exit gates pass;
- Salesforce remains the only Account system of record;
- protected routes reject invalid token types and missing scopes;
- least-privilege AWS and Salesforce permissions are independently reviewed;
- numeric throttling/concurrency/timeouts protect Salesforce quotas;
- secrets, tokens, authorization headers, and Account payloads are absent from logs and build artifacts;
- threat model, alarms, incident procedures, user offboarding, secret rotation, rollback, and cleanup are tested or exercised;
- staging and production are environment-isolated;
- CI checks and production approval gates are enforced;
- a final end-to-end smoke test and rollback rehearsal succeed.

## 11. Explicit non-goals

Unless separately approved: database/cache persistence, per-user Salesforce OAuth, multi-org support, role-based application authorization, delete, background sync, advanced search, full pagination, multi-region, event-driven replication, or complex promotion orchestration.
