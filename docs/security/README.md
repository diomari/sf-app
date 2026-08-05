# Security Documentation

Milestone 8 must add and approve a threat model covering:

- browser, Cognito, CloudFront, API Gateway, Lambda, Secrets Manager, CI/CD, and Salesforce trust boundaries;
- token substitution, XSS/token theft, broken access control, mass assignment, SOQL injection, SSRF, credential leakage, cache leakage, replay/duplicate writes, concurrent updates, denial of service, quota exhaustion, supply-chain compromise, and unsafe deployment;
- preventive controls, detection, response owners, residual risk, and test evidence.

The threat model must explicitly document the shared Salesforce integration-user trust model and obtain data-owner acceptance before deploying staging against the Salesforce sandbox.
