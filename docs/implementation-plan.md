# Salesforce Account App — Implementation Plan

**Status:** Proposed for approval  
**Source:** [`../salesforce-account-app-technical-implementation.md`](../salesforce-account-app-technical-implementation.md)  
**Delivery approach:** Security-first, incremental vertical slices  
**System of record:** Salesforce; no application database

## 1. Outcome

Deliver a staging-ready web application in which approved Cognito users can search, page through, create, update, and delete Salesforce Accounts through a typed Hono API deployed on AWS. The implementation must remain stateless, least-privileged, observable, and bounded so AWS concurrency cannot overwhelm Salesforce. A production environment is explicitly outside the current project scope.

## 2. Architectural principles

1. **Salesforce remains authoritative.** Do not persist Account data in AWS databases, logs, caches, analytics, or browser service workers.
2. **Authenticate at the edge; authorize explicitly.** API Gateway validates signature, issuer, client/audience, expiry, and an API-specific OAuth scope. Requiring the scope is the control that excludes Cognito ID tokens; deployed tests must prove this. Lambda applies any future business authorization.
3. **Use one deployed topology.** The single staging environment uses the generated CloudFront domain to serve the private-S3 frontend and proxy `/api/*` to the API Gateway default `execute-api` endpoint. Because no custom domain is available, the API endpoint remains directly reachable; JWT authorization, throttling, payload limits, and no-cache controls therefore apply identically at API Gateway. Browser traffic uses CloudFront as the same-origin path.
4. **Expose application contracts, not Salesforce internals.** Fixed SOQL, allowlisted fields, strict schemas, normalized errors, and DTO mapping are mandatory.
5. **Fail closed and bound work.** Timeouts, payload limits, throttles, reserved concurrency, list limits, and non-retry rules protect Salesforce and cost.
6. **Use least privilege throughout.** Use one-secret IAM access, a staging-scoped deployment role, a dedicated Salesforce sandbox integration user, and explicit field-level permissions. Do not reuse staging identities or secrets for a future production environment.
7. **Make operations observable without exposing data.** Structured metadata-only logs, metrics, alarms, request correlation, and safe audit events.
8. **Deploy a verified immutable artifact.** CI validates each artifact before an approval-gated deployment directly to the single staging environment using short-lived credentials. Production promotion and complex deployment orchestration remain out of scope.

## 3. Target architecture

```text
Browser
  ├── /, /assets/* ──> CloudFront ──OAC──> private S3
  ├── Cognito redirect <───────────────> Cognito Managed Login
  └── /api/* ────────> CloudFront (cache disabled)
                          └──> API Gateway HTTP API
                                 (default endpoint retained as CloudFront origin)
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

- `local`: developer tooling only, with mocked Salesforce by default. Direct sandbox access remains opt-in and requires approval.
- `staging`: the only deployed environment, containing one Cognito pool, Secrets Manager secret, CloudFront distribution, API Gateway API, Lambda, logs/alarms, and Salesforce sandbox integration user.
- `production`: not created and not part of the current project. A future production environment requires a new architecture decision and must use separate identities, secrets, infrastructure, and Salesforce credentials.

The staging environment still uses production-grade security controls so the architecture can be promoted later without weakening its trust boundaries.

## 4. Gate 0 — decisions required before feature implementation

Record each decision in [`architecture/decision-log.md`](architecture/decision-log.md). Block affected work until an owner approves it.

| ID | Decision | Recommended default | Owner |
|---|---|---|---|
| D-01 | Deployment environment topology | **Approved:** one direct staging environment only; production is out of scope | Project owner |
| D-02 | Initial capacity envelope | **Approved:** 10 users, 2 requests/second sustained, burst 5, Lambda reserved concurrency 5; verify Salesforce quota before deploy | Product + Salesforce |
| D-03 | List and search behavior | **Approved:** signed opaque cursor pagination, 50 records per page; search Account Name and Account Number | Product |
| D-04 | `parentId` contract and lookup/access UX | **Approved:** retain in API; defer parent picker UI | Product + Salesforce |
| D-05 | PATCH/null semantics | **Approved:** omitted unchanged; `null` clears nullable field; empty PATCH rejected | API owner |
| D-06 | Concurrent updates | **Approved:** conditional update; return `412 PRECONDITION_FAILED` | Product + Salesforce |
| D-07 | Create idempotency | **Approved:** no ambiguous-failure retry and no External ID initially | Product + Salesforce |
| D-08 | Salesforce auth mode | **Approved:** Client Credentials with dedicated least-privileged sandbox integration user | Salesforce security |
| D-09 | Cognito policy | **Approved:** admin users only, self-sign-up off, no MFA in staging | Security |
| D-10 | Browser token storage | **Approved:** memory/session-oriented storage using a reviewed OIDC library | Security + frontend |
| D-11 | API OAuth scope | **Approved:** require `accounts-api/access` on protected routes | Security |
| D-12 | Salesforce source IP restriction | **Approved:** no static-IP requirement and no Lambda VPC | Platform + Salesforce |
| D-13 | SLOs and support | **Approved:** best effort, API p95 under 5 seconds, four-business-hour recovery target; alarm recipient still required | Product + operations |
| D-14 | Staging resource retention/removal policy | **Approved:** 30-day logs, retain secret, explicit approval before resource destruction | Platform + security |
| D-15 | AWS region, domains, certificates, and direct-origin exposure | **Approved:** Singapore `ap-southeast-1`, no custom domain, default API endpoint retained | Platform |
| D-16 | Account search and delete scope | **Approved:** search Name/Account Number and delete Accounts with explicit confirmation | Product + Salesforce |
| D-17 | Salesforce environment and test data | **Approved:** Salesforce sandbox only with disposable test Accounts | Product + Salesforce |
| D-18 | Alarm notification recipient | **Approved:** `diom.sea@gmail.com` | Operations |
| D-19 | Remaining capacity limits | **Approved:** search 2–100 chars; cursor 15 minutes/HMAC-SHA256; request 64 KiB; response 1 MiB; Salesforce 10s; Lambda 15s; aggregate 2 rps/burst 5; writes 1 rps/burst 2; USD 25/month budget alarm; confirm Salesforce quota | Platform + Salesforce |

### Source-spec clarifications to carry into implementation

- Create requires a nonblank `name`; PATCH permits omission of `name` but rejects an empty body.
- Add `INTEGRATION_FORBIDDEN` consistently or map it to the approved public code table.
- `not_configured` is valid for integration status; Account routes return controlled `503`.
- Client Credentials is the only approved Salesforce auth mode; fail closed rather than introducing a JWT Bearer fallback.
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

- Secrets provider restricted to one secret ARN with a strict Client Credentials schema containing client ID, client secret, approved sandbox login/My Domain URL, and cursor-signing key.
- Salesforce host allowlist validation for login and returned instance URLs.
- Module-memory token cache with safety skew and single-flight token acquisition.
- Bounded HTTP client with abort support and normalized upstream errors.
- One token-refresh replay after an explicit Salesforce `401`, including create/update/delete because Salesforce rejected the request before processing. Never retry a write after a timeout, network failure, `429`, or `5xx`, where the outcome may be ambiguous.

**Exit gate**

- Unit tests cover token acquisition concurrency, expiry, invalid/rotated secrets, host rejection, timeouts, `401` replay, and non-retry rules.
- Before any real sandbox call, Salesforce and data owners approve and record the connected-app OAuth policy, Account object CRUD, writable/readable fields, sharing/record visibility, and the shared-principal risk.
- Only after that approval, the integration user authenticates against the staging Salesforce sandbox.

### Milestone 4 — Searchable, paginated read vertical slice

**Deliverables**

- Server-owned SOQL templates and Salesforce-to-application mapping.
- `GET /api/accounts?search=<term>&cursor=<opaque>` with a fixed page size of 50.
- Case-insensitive search across Account Name and Account Number with bounded input and safely escaped SOQL literals.
- Signed opaque keyset cursor bound to the search criteria; never expose Salesforce `nextRecordsUrl` or accept raw offsets/SOQL.
- Bounded `GET /api/integration/status` semantics; never expose raw failures or poll continuously from the UI.
- API response headers include `Cache-Control: no-store`.

**Exit gate**

- Mocked integration tests pass for success, `401`, `403`, `429`, `5xx`, and timeout.
- A staging sandbox test lists, searches, and paginates Accounts without duplicates or exposing SOQL, cursor internals, tokens, or raw Salesforce payloads.
- Data owner confirms the shared-integration-user visibility model.

### Milestone 5 — Create, update, and delete

**Deliverables**

- Explicit application-to-Salesforce write mapping.
- `POST /api/accounts`, nonempty `PATCH /api/accounts/:id` requiring `If-Unmodified-Since`, and `DELETE /api/accounts/:id` returning `204` on success.
- Approved null-clearing, concurrency, and idempotency behavior.
- Delete requires a valid Account ID, least-privileged Salesforce Delete permission, an explicit UI confirmation showing the Account name, and no automatic retry after ambiguous failure.
- Safe audit event: Cognito `sub`, action, Account ID where known, outcome, and request ID—never full payload values.

**Exit gate**

- Tests cover Salesforce validation rules, missing records, delete constraints, permission errors, conflicts, rate limits, timeout ambiguity, and accidental retry prevention.
- Staging tests create, update, search for, and delete a disposable Account and confirm Salesforce is authoritative.

### Milestone 6 — Secure AWS infrastructure

**Deliverables**

- Cognito with self-sign-up disabled, admin-created users, MFA disabled for staging, exact callbacks/logout URLs, PKCE `S256`, API resource server/scope, approved password/token settings, and secretless SPA client.
- API Gateway JWT authorizer with protected-by-default routes; only health is public.
- Numeric route throttles, payload limits, access logging, Lambda timeout/memory/reserved concurrency, alias, and least-privilege IAM.
- Private encrypted S3 with Block Public Access and CloudFront OAC; never S3 website hosting.
- CloudFront `/api/*` behavior forwards authorization, query strings, and required request data, allows API methods including `DELETE`, disables caching, and cannot be rewritten by SPA fallback. With no custom domain, API Gateway's default endpoint remains enabled as the CloudFront origin and receives identical JWT, throttle, payload, and response controls. CloudFront must set the API Gateway origin `Host` header rather than forwarding the viewer's CloudFront host; verify this with a CDK assertion and deployed API test.
- TLS-only, modern TLS policy, security response headers, immutable asset caching, and short/no-cache `index.html`.
- Explicit staging log retention/encryption and resource removal/termination policies.

**Exit gate**

- CDK assertions and `cdk-nag` checks pass.
- ID tokens and incorrectly scoped access tokens are rejected in a deployed test.
- Protected routes return `401` without a valid access token; health remains public.
- S3 objects are inaccessible directly and API responses are not cached through either CloudFront or the directly reachable API Gateway endpoint.

### Milestone 7 — Cognito frontend and Account UI

**Deliverables**

- Reviewed OIDC/PKCE library integration with state/nonce handling, callback cleanup, token expiry handling, logout, and protected rendering.
- Typed API client that attaches the access token and maps standard errors.
- Accessible responsive table, debounced search, 50-item cursor pagination, create/update form, delete confirmation, field-level validation, and clear loading/empty/error/success states.
- External website links restricted to safe schemes and rendered with `noopener noreferrer`.

**Exit gate**

- Component/integration tests cover redirect, callback, logout, token attachment/expiry, search, pagination, create, update, delete confirmation/cancellation, clear-field behavior, conflict refresh, keyboard use, and responsive layout.
- No Salesforce endpoint, credential, or token appears in frontend source or artifacts.

### Milestone 8 — Observability, capacity, and security validation

**Deliverables**

- Dashboard and alarms for API 4xx/5xx/429, Lambda errors/throttles/duration/concurrency, Salesforce status classes/latency, Cognito sign-in anomalies, and the USD 25 monthly budget threshold. Deliver staging notifications to `diom.sea@gmail.com`.
- Numeric capacity envelope documenting API Gateway throttles, Lambda reserved concurrency, request/response limits, Salesforce timeouts, API quotas, and expected peak load.
- Threat model, incident/runbook documentation, secret rotation, user offboarding, quota exhaustion, Salesforce outage, and rollback procedures.
- Low-volume load test constrained to avoid Salesforce sandbox quota exhaustion or unintended data impact.

**Exit gate**

- Security review approves trust boundaries, IAM, auth flows, CSP, data handling, and logs.
- Load evidence shows configured limits protect Salesforce and meet approved SLOs.
- Alarm delivery and at least one failure runbook are exercised.

### Milestone 9 — CI/CD and release readiness

**Deliverables**

- PR workflow: frozen install, lint, typecheck, unit/integration tests, coverage, builds, CDK synth/assertions, dependency audit, secret scan, and IaC scan.
- Deployment via GitHub OIDC or equivalent short-lived credentials; no long-lived AWS keys.
- Immutable, approval-gated deployment directly to staging, automated smoke test, and documented staging rollback. Do not build production promotion or a complex deployment pipeline in the baseline.
- Setup, deployment, release, rollback, and cleanup documentation.

**Exit gate**

- A failing required check blocks merge.
- An independent operator follows the docs from clean checkout through staging deployment.
- Staging acceptance verifies login, invalid-token rejection, search, 50-record cursor pagination, create/update/delete, Salesforce consistency, no database, log redaction, alarms, and rollback.

## 6. Security control baseline

### Identity and authorization

- Cognito self-sign-up off; admin-approved user lifecycle.
- Staging uses admin-created users with self-sign-up disabled; MFA is intentionally disabled by approved project decision and must be reconsidered before any future production use.
- Require an API-specific OAuth scope to prevent an ID token being accepted as API authorization.
- Validate exact issuer and audience; rely on API Gateway for signature/expiry validation and deployed negative tests for configuration correctness.
- Shared Salesforce-principal risk requires written data-owner acceptance. If users need different record visibility, stop and redesign authorization.

### Secrets and network

- Create secret values out of band; never pass secret material through CDK context, CloudFormation parameters, frontend variables, or CI logs.
- Lambda reads one secret ARN and, if applicable, decrypts with one KMS key.
- Permit only approved HTTPS Salesforce/My Domain hosts and reject redirects to unexpected hosts.
- Use VPC/NAT only if static egress or another explicit network requirement justifies its cost and operational burden.

### Application and data

- Server-owned query templates, allowlisted writable fields, strict schemas, bounded search/strings/numbers, safe URL schemes, and body-size limits.
- No raw SOQL, Salesforce field selection, object name, `nextRecordsUrl`, token, or raw upstream error crosses the API boundary.
- No Account responses in CloudFront caches, service-worker caches, logs, tracing payloads, or analytics.
- Do not retry ambiguous create, update, or delete operations automatically. PATCH requires `If-Unmodified-Since`; missing preconditions return `428` and stale records return `412`.

### Supply chain and delivery

- Pin runtime/package-manager versions and commit the lockfile.
- Dependabot/Renovate plus dependency, secret, and IaC scanning.
- Branch protection, required review for identity/IAM/infrastructure/security changes, and artifact provenance retained by CI.
- Use short-lived OIDC deployment roles scoped by environment.

## 7. Scalability and reliability envelope

The app is stateless, but Salesforce is the limiting dependency. Gate 0 must turn the following into numeric settings:

- Fixed 50-record page size; normalized search length 2–100 characters when nonempty.
- Signed HMAC-SHA256 cursor with a 15-minute lifetime, search binding, and tamper rejection.
- Application request-body limit of 64 KiB and serialized API response limit of 1 MiB.
- API Gateway aggregate throttle of 2 requests/second with burst 5; write-route override of 1 request/second with burst 2.
- Lambda reserved concurrency 5 and timeout 15 seconds; abort Salesforce requests at 10 seconds or earlier when Lambda time is nearly exhausted.
- Confirm Salesforce daily and concurrent API quotas before deployment and ensure the capacity envelope remains within them.
- CloudWatch log-ingestion monitoring and AWS budget alarm at USD 25/month, delivered to `diom.sea@gmail.com`.

Scale changes follow this order: optimize request count and payload size, tune Lambda memory, adjust throttles/concurrency within Salesforce quotas, then request quota changes. Do not add a database or data cache as a scaling shortcut without a new architecture decision.

## 8. Verification strategy

| Layer | Required evidence |
|---|---|
| Shared contracts | Schema and mapping unit tests; compile-time DTO separation |
| API | Hono request tests with mocked Salesforce and log-capture assertions |
| Integration | Controlled Salesforce sandbox search/pagination/create/update/delete tests |
| Frontend | Component tests plus user-level auth and Account flows |
| Infrastructure | CDK assertions, synth, `cdk-nag`, least-privilege review |
| Security | Negative JWT tests, secret scan, dependency scan, threat-model review |
| Capacity | Bounded staging load test and quota/concurrency evidence |
| Release | Automated smoke test and independently executed rollback |

No staging sandbox test may create, update, or delete records without an approved disposable-test-data procedure.

## 9. Work ownership and review

- **Product owner:** field scope, record limit, conflict/idempotency UX, acceptance.
- **Salesforce owner:** connected app, integration user, sharing/FLS, validation rules, API quotas.
- **Security owner:** Cognito settings, scope design, threat model, secrets, audit controls.
- **Platform owner:** AWS accounts, CDK, domains, alarms, deployment roles, cost controls.
- **Engineering owner:** contracts, application implementation, automated tests, documentation.

Identity, IAM, Salesforce permissions, CloudFront behavior, and staging deployment require independent review.

## 10. Definition of done

The project is complete only when:

- all Gate 0 decisions are approved and recorded;
- all milestone exit gates pass;
- Salesforce remains the only Account system of record;
- protected routes reject invalid token types and missing scopes;
- users can search and paginate Accounts in 50-record pages and can safely delete a confirmed Account;
- least-privilege AWS and Salesforce permissions are independently reviewed;
- numeric throttling/concurrency/timeouts protect Salesforce quotas;
- secrets, tokens, authorization headers, and Account payloads are absent from logs and build artifacts;
- threat model, alarms, incident procedures, user offboarding, secret rotation, rollback, and cleanup are tested or exercised;
- the single staging environment is isolated and contains no production credentials or data;
- CI checks and the staging deployment approval gate are enforced;
- a final end-to-end smoke test and rollback rehearsal succeed.

## 11. Explicit non-goals

Unless separately approved: a production environment, database/cache persistence, per-user Salesforce OAuth, multi-org support, role-based application authorization, background sync, advanced filtering beyond the approved Name/Account Number search, multi-region, event-driven replication, or complex promotion orchestration.
