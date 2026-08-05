Follow `/AGENTS.md` as the authoritative repository instruction set. Before suggesting or changing code, also consult `/docs/implementation-plan.md`, `/docs/architecture/decision-log.md`, and `/SECURITY.md`.

Preserve the core invariants: Salesforce is the only Account system of record; secrets and tokens stay server-side; schemas/queries are explicit; protected APIs require the approved Cognito access-token scope; writes are not automatically retried; deployment and real integrations require explicit approval.
