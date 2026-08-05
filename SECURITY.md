# Security Policy and Engineering Baseline

## Scope and data classification

The application processes Salesforce Account business data. Treat Account fields as confidential business data even when individual fields are not regulated. Cognito tokens, Salesforce tokens, client secrets, private keys, session material, and authorization headers are secrets.

Salesforce is the sole Account system of record. Account data must not be copied into AWS databases, logs, traces, analytics, caches, service-worker storage, fixtures derived from any real Salesforce data, or source control.

## Trust boundaries

- Browser to Cognito Managed Login.
- Browser through CloudFront to API Gateway; the default API Gateway endpoint is also directly reachable because staging has no custom domain.
- API Gateway JWT authorizer to Lambda.
- Lambda to Secrets Manager.
- Lambda to approved Salesforce hosts.
- CI/CD to AWS through short-lived environment-scoped roles.

The shared Salesforce sandbox integration user means every admitted staging user has the same Salesforce capabilities exposed by the API. Deployment requires explicit data-owner acceptance, controlled admin-only Cognito provisioning, and least-privileged Salesforce sharing/object/field permissions including Delete. MFA is intentionally disabled for staging by approved decision; this risk must be reconsidered before any future production environment.

## Mandatory controls

- Authorization Code + PKCE `S256`; no implicit grant and no browser client secret.
- Admin-only Cognito user creation; self-sign-up disabled; exact callback/logout allowlists.
- API-specific OAuth scope required on every protected route; deployed negative-token tests.
- Server-owned SOQL templates and strict allowlisted DTOs; bounded Name/Account Number search with safe literal escaping; signed opaque pagination cursors; no client-provided Salesforce syntax.
- One-secret IAM access, mode-specific secret validation, and approved Salesforce HTTPS-host allowlist.
- S3 Block Public Access and CloudFront OAC; API caching disabled.
- Numeric API throttles, Lambda reserved concurrency, payload limits, and outbound timeouts.
- Structured redacted logs and metadata-only audit events.
- No automatic retry of ambiguous create, update, or delete operations.
- Secret, dependency, and IaC scanning in CI; short-lived deployment credentials.

## Secret handling

- Real secret values are created and rotated out of band.
- Never commit `.env` files, private keys, tokens, Salesforce exports, AWS credentials, or realistic-looking sample secrets.
- Frontend `VITE_*` values may contain only public Cognito/API configuration.
- Do not place secrets in CDK context, CloudFormation parameters, command arguments captured by CI, issue trackers, screenshots, or logs.
- If a secret is exposed: stop work, do not copy it further, notify the security owner, revoke/rotate it, preserve minimal incident evidence, and review logs/history for exposure. Git history rewriting does not replace credential rotation.

## Safe logging

Allowed examples: request ID, route template, HTTP method, duration, outcome, safe upstream status class, Cognito `sub`, action type, and Account ID when required for audit.

Never log tokens, authorization headers, secrets, private keys, complete payloads, complete Salesforce errors, arbitrary user-provided request IDs, or Account field values.

## Vulnerability reporting

Do not open a public issue for a suspected vulnerability or leaked credential. Report privately to the project security owner. Until a contact is assigned in the decision log, notify the repository owner through the organization’s approved private channel.

A security fix is not complete until credentials are rotated when relevant, regression tests exist, affected logs/artifacts are assessed, and the threat model/runbook is updated.
