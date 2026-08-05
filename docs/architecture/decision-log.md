# Architecture Decision Log

Use this register for decisions that affect security, data contracts, infrastructure, scalability, cost, or operations. Do not mark a decision `Approved` without the named owner’s confirmation. For complex decisions, add a dedicated ADR under `docs/architecture/adr/` and link it here.

| ID | Decision | Status | Proposed default | Owner | Evidence/date |
|---|---|---|---|---|---|
| D-01 | AWS account, region, CloudFront/API domains, certificates, and direct-origin exposure | Proposed | Separate staging/production; stable custom domains; disable default API endpoint | Platform | — |
| D-02 | User count, peak traffic, Account volume, Salesforce quota allocation | Open | Measure before setting numeric limits | Product + Salesforce | — |
| D-03 | Initial list behavior | Proposed | Latest 100 with limit/truncation metadata | Product | — |
| D-04 | `parentId` contract and lookup/access UX | Proposed | Retain source-spec API scope; confirm safe UI behavior | Product + Salesforce | — |
| D-05 | PATCH and null semantics | Proposed | Omitted unchanged; `null` clears nullable field; empty PATCH rejected | API owner | — |
| D-06 | Concurrent update policy | Proposed | Conditional update; return `412` on conflict | Product + Salesforce | — |
| D-07 | Create idempotency | Open | No write retries; use External ID only if approved | Product + Salesforce | — |
| D-08 | Salesforce authentication mode | Proposed | Explicit per environment; client credentials preferred | Salesforce security | — |
| D-09 | Cognito user/MFA policy | Proposed | Admin-only users; self-sign-up off; production MFA | Security | — |
| D-10 | Browser token storage/refresh | Open | Memory/session-oriented storage using reviewed OIDC library | Security + frontend | — |
| D-11 | API OAuth scope | Proposed | Require `accounts-api/access` | Security | — |
| D-12 | Salesforce source-IP restrictions | Open | No VPC unless stable egress is required | Platform + Salesforce | — |
| D-13 | SLOs, alert ownership, RTO | Open | Define before production infrastructure | Product + operations | — |
| D-14 | Production removal/retention policies | Open | Retain logs and secrets; protect stateful/security resources | Platform + security | — |

## Decision record template

```md
### D-XX — Title

- Status: Open | Proposed | Approved | Rejected | Superseded
- Date:
- Owners:
- Context:
- Decision:
- Security/data implications:
- Scalability/cost implications:
- Alternatives considered:
- Validation and rollback:
- Supersedes / superseded by:
```
