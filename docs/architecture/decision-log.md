# Architecture Decision Log

Use this register for decisions that affect security, data contracts, infrastructure, scalability, cost, or operations. Do not mark a decision `Approved` without the named owner’s confirmation. For complex decisions, add a dedicated ADR under `docs/architecture/adr/` and link it here.

| ID | Decision | Status | Proposed default | Owner | Evidence/date |
|---|---|---|---|---|---|
| D-01 | Deployment environment topology | Approved | One direct staging environment only; no production environment in current scope | Project owner | User direction, 2026-08-05 |
| D-02 | Initial capacity envelope | Approved | 10 users; 2 requests/second sustained; burst 5; Lambda reserved concurrency 5; confirm Salesforce quota before deployment | Product + Salesforce | User approval, 2026-08-05 |
| D-03 | List and search behavior | Approved | Signed opaque cursor pagination at 50 records/page; search Name and Account Number | Product | User approval, 2026-08-05 |
| D-04 | `parentId` contract and lookup/access UX | Approved | Retain API field; defer parent picker UI | Product + Salesforce | User approval, 2026-08-05 |
| D-05 | PATCH and null semantics | Approved | Omitted unchanged; `null` clears nullable field; empty PATCH rejected | API owner | User approval, 2026-08-05 |
| D-06 | Concurrent update policy | Approved | Conditional update; return `412` on conflict | Product + Salesforce | User approval, 2026-08-05 |
| D-07 | Create idempotency | Approved | No retry after ambiguous failure; no External ID initially | Product + Salesforce | User approval, 2026-08-05 |
| D-08 | Salesforce authentication mode | Approved | Client Credentials with a dedicated least-privileged sandbox integration user | Salesforce security | User approval, 2026-08-05 |
| D-09 | Cognito user/MFA policy | Approved | Admin-created users only; self-sign-up off; no MFA in staging | Security | User approval, 2026-08-05 |
| D-10 | Browser token storage/refresh | Approved | Memory/session-oriented storage using reviewed OIDC library | Security + frontend | User approval, 2026-08-05 |
| D-11 | API OAuth scope | Approved | Require `accounts-api/access` | Security | User approval, 2026-08-05 |
| D-12 | Salesforce source-IP restrictions | Approved | No static-IP requirement; Lambda remains outside a VPC | Platform + Salesforce | User confirmation, 2026-08-05 |
| D-13 | Staging service targets | Approved | Best effort; API p95 under 5 seconds; four-business-hour recovery target | Product + operations | User approval, 2026-08-05 |
| D-14 | Staging removal/retention policies | Approved | 30-day logs; retain secret; explicit approval before destruction | Platform + security | User approval, 2026-08-05 |
| D-15 | AWS region, domains, certificates, and direct-origin exposure | Approved | Singapore `ap-southeast-1`; no custom domain; retain default API endpoint as CloudFront origin | Platform | User direction, 2026-08-05 |
| D-16 | Account search and delete scope | Approved | Search Name/Account Number; delete with explicit confirmation and no ambiguous-failure retry | Product + Salesforce | User direction, 2026-08-05 |
| D-17 | Salesforce environment and test data | Approved | Salesforce sandbox only; disposable test Accounts | Product + Salesforce | User confirmation, 2026-08-05 |
| D-18 | Alarm notification recipient | Approved | Send staging alarms to `diom.sea@gmail.com` | Operations | User approval, 2026-08-05 |
| D-19 | Search, cursor, payload, timeout, Salesforce quota and budget limits | Approved | Search 2–100 chars; 15-minute HMAC-SHA256 cursor; 64 KiB request; 1 MiB response; Salesforce 10s; Lambda 15s; aggregate 2 rps/burst 5; writes 1 rps/burst 2; USD 25/month budget alarm; confirm Salesforce quota | Platform + Salesforce | User approval, 2026-08-05 |

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
