# Salesforce Account Management App

## Technical Implementation Specification

**Status:** Phase 1 implementation basis  
**Deployment:** AWS  
**Primary system of record:** Salesforce  
**Application database:** None in the baseline release  
**Scope:** Application login, Salesforce Account listing, creation and update

---

## 1. Objective

Build a small web application that allows an authenticated application user to:

1. Sign in to the application.
2. View existing Salesforce Account records in a table.
3. Create a new Salesforce Account.
4. Update an existing Salesforce Account.
5. See the latest data after a successful create or update.

Salesforce remains the authoritative store for Account records. The application must not copy Account records into DynamoDB, RDS or another application database.

The application is a secure frontend and API layer over Salesforce.

---

## 2. Confirmed implementation decisions

| Decision | Baseline implementation |
|---|---|
| Deployment | AWS |
| Frontend | React, Vite and TypeScript |
| Backend | Hono, TypeScript and AWS Lambda |
| API entry point | API Gateway HTTP API |
| Application login | Amazon Cognito User Pool with Managed Login and Authorization Code + PKCE |
| API authorization | API Gateway HTTP API JWT authorizer |
| Salesforce authentication | OAuth Client Credentials Flow using a dedicated integration user |
| Salesforce fallback | JWT Bearer Flow if Client Credentials is unavailable or not approved |
| Salesforce integration | Salesforce REST API |
| Infrastructure | AWS CDK with TypeScript |
| Secrets | AWS Secrets Manager |
| Logging | CloudWatch Logs |
| Business-data storage | Salesforce only |
| Initial Account operations | List, create and update |

Do not add Cognito groups, custom authorization Lambdas, application sessions, DynamoDB or RDS unless a later requirement explicitly needs them.

---

## 3. End-to-end architecture

```text
                         +----------------------+
                         |       Browser        |
                         | React + Vite + TS    |
                         +----------+-----------+
                                    |
                         Cognito login with PKCE
                                    |
                                    v
                         +----------------------+
                         |   Cognito User Pool  |
                         |   Managed Login       |
                         +----------+-----------+
                                    |
                              JWT access token
                                    v
                         +----------------------+
                         |   CloudFront + S3    |
                         |   Static frontend    |
                         +----------+-----------+
                                    |
                         HTTPS API request + JWT
                                    v
                         +----------------------+
                         | API Gateway HTTP API |
                         | JWT authorizer       |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         | AWS Lambda           |
                         | Hono API             |
                         +----+------------+----+
                              |            |
                 read secret |            | Salesforce REST API
                              v            v
                   +----------+--+   +-----+----------------+
                   | Secrets     |   | Salesforce           |
                   | Manager     |   | Account records      |
                   +-------------+   +----------------------+

                         CloudWatch Logs receives
                         redacted operational events.
```

### Component responsibilities

#### React frontend

- Render login, Account table and Account form.
- Start Cognito Managed Login.
- Attach the Cognito access token to API requests.
- Display loading, empty, success and error states.
- Perform basic client-side validation for usability.
- Never contain Salesforce client secrets or Salesforce tokens.

#### CloudFront and S3

- Serve the compiled React application over HTTPS.
- Keep the S3 bucket private where practical.
- Route browser API calls to the API Gateway origin or use a configured API base URL.

#### Cognito User Pool

- Manage application users.
- Provide Managed Login.
- Issue JWT access tokens using Authorization Code + PKCE.
- Use one manually created user for the initial demo.

#### API Gateway HTTP API

- Expose the backend over HTTPS.
- Validate Cognito JWTs before invoking Lambda.
- Reject missing, invalid or expired tokens with `401 Unauthorized`.
- Apply CORS and basic throttling configuration.

#### Hono Lambda

- Define the HTTP routes.
- Validate request bodies.
- Read Salesforce configuration from Secrets Manager.
- Acquire and cache Salesforce access tokens.
- Query, create and update Salesforce Accounts.
- Normalize Salesforce errors into application errors.
- Write redacted structured logs.

#### Salesforce

- Store Account records.
- Authenticate the backend integration user.
- Execute the approved SOQL query.
- Create and update Account records through the REST API.

---

## 4. Authentication design

There are two independent authentication flows.

### 4.1 Application user authentication

Use Cognito User Pool Managed Login with Authorization Code + PKCE.

```text
1. User opens the React application.
2. React redirects the user to Cognito Managed Login.
3. User signs in with email and password.
4. Cognito returns an authorization code.
5. The frontend exchanges the code using PKCE.
6. The frontend receives Cognito tokens.
7. API requests include the Cognito access token.
8. API Gateway validates the JWT before Lambda runs.
```

Implementation rules:

- Use a Cognito public app client with no client secret in the browser.
- Use Authorization Code + PKCE.
- Do not use the OAuth implicit grant.
- Do not create a custom password or session system.
- Do not store Cognito client secrets in frontend code.
- Use the Cognito access token for API authorization.
- Configure the API Gateway JWT authorizer with the Cognito issuer URL and audience/client ID.
- For the first release, all authenticated users have the same application permissions.

References:

- [AWS HTTP API JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
- [Amazon Cognito PKCE authorization code flow](https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html)

### 4.2 Salesforce backend authentication

Use Salesforce OAuth Client Credentials Flow with a dedicated Salesforce integration user.

```text
1. Lambda reads Salesforce client ID and client secret from Secrets Manager.
2. Lambda requests an access token from Salesforce.
3. Salesforce returns an access token and instance URL.
4. Lambda caches the token in execution-environment memory.
5. Lambda uses the token for Salesforce REST API calls.
6. When the token expires, Lambda obtains a new token.
```

Implementation rules:

- Keep Salesforce client credentials entirely server-side.
- Use a dedicated Salesforce integration user.
- Grant only the Salesforce permissions required for Account operations.
- Do not store Salesforce Account data locally.
- Do not send Salesforce access tokens to the browser.
- Retry one time after invalidating the cached token when Salesforce returns `401`.
- Do not repeatedly retry failed Salesforce requests.

If Client Credentials Flow is not available or approved for the Salesforce organization, use JWT Bearer Flow as the fallback. Store the private key in Secrets Manager.

Reference:

- [Salesforce OAuth Client Credentials Flow](https://developer.salesforce.com/blogs/2024/02/invoke-rest-apis-with-the-salesforce-integration-user-and-oauth-client-credentials)

---

## 5. Recommended repository structure

```text
salesforce-account-app/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   │   ├── auth-config.ts
│   │   │   │   ├── auth-provider.tsx
│   │   │   │   └── RequireAuth.tsx
│   │   │   ├── features/accounts/
│   │   │   │   ├── account.api.ts
│   │   │   │   ├── account.types.ts
│   │   │   │   ├── AccountForm.tsx
│   │   │   │   ├── AccountsTable.tsx
│   │   │   │   └── AccountPage.tsx
│   │   │   ├── components/
│   │   │   ├── lib/api-client.ts
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── api/
│       ├── src/
│       │   ├── clients/
│       │   │   └── salesforce.client.ts
│       │   ├── config/
│       │   │   └── environment.ts
│       │   ├── middleware/
│       │   │   ├── error-handler.ts
│       │   │   └── request-context.ts
│       │   ├── routes/
│       │   │   ├── accounts.ts
│       │   │   ├── health.ts
│       │   │   └── integration-status.ts
│       │   ├── schemas/
│       │   │   └── account.schema.ts
│       │   ├── services/
│       │   │   ├── salesforce-auth.service.ts
│       │   │   └── salesforce-account.service.ts
│       │   ├── app.ts
│       │   └── index.ts
│       ├── test/
│       └── package.json

├── infrastructure/
│   ├── bin/
│   │   └── app.ts
│   ├── lib/
│   │   ├── frontend-stack.ts
│   │   ├── identity-stack.ts
│   │   ├── api-stack.ts
│   │   └── application-stack.ts
│   └── package.json

├── packages/
│   └── shared/
│       ├── src/
│       │   └── account.types.ts
│       └── package.json

├── package.json
├── pnpm-workspace.yaml
├── README.md
└── .gitignore
```

Keep Salesforce-specific logic inside `apps/api`. The frontend should use application DTOs rather than Salesforce response objects directly.

---

## 6. API contract

All routes except `/api/health` should require a valid Cognito JWT.

### Health check

```http
GET /api/health
```

Response:

```json
{
  "status": "ok"
}
```

The health check must not call Salesforce. It only verifies that the Lambda is reachable.

### Integration status

```http
GET /api/integration/status
Authorization: Bearer <cognito-access-token>
```

Response example:

```json
{
  "data": {
    "provider": "salesforce",
    "status": "connected"
  }
}
```

Allowed status values:

- `connected`
- `not_configured`
- `unavailable`

Never return client IDs, secrets, token values or raw Salesforce errors.

### List Accounts

```http
GET /api/accounts
Authorization: Bearer <cognito-access-token>
```

Response:

```json
{
  "data": [
    {
      "id": "001000000000001AAA",
      "name": "Example Company",
      "accountNumber": "AC-1001",
      "type": "Customer - Direct",
      "industry": "Technology",
      "annualRevenue": 1000000,
      "numberOfEmployees": 25,
      "ownership": "Private",
      "rating": "Hot",
      "phone": "+63 912 345 6789",
      "fax": null,
      "website": "https://example.com",
      "description": "Example Account",
      "billingStreet": "123 Example Street",
      "billingCity": "Makati",
      "billingState": "Metro Manila",
      "billingPostalCode": "1200",
      "billingCountry": "Philippines",
      "shippingStreet": null,
      "shippingCity": null,
      "shippingState": null,
      "shippingPostalCode": null,
      "shippingCountry": null,
      "createdDate": "2026-08-05T10:00:00.000Z",
      "lastModifiedDate": "2026-08-05T10:00:00.000Z"
    }
  ]
}
```

The backend owns the SOQL query. Do not accept raw SOQL, object names or field lists from the browser.

Recommended first query:

```sql
SELECT Id,
       Name,
       AccountNumber,
       Type,
       ParentId,
       Industry,
       AnnualRevenue,
       NumberOfEmployees,
       Ownership,
       Rating,
       Phone,
       Fax,
       Website,
       Description,
       BillingStreet,
       BillingCity,
       BillingState,
       BillingPostalCode,
       BillingCountry,
       ShippingStreet,
       ShippingCity,
       ShippingState,
       ShippingPostalCode,
       ShippingCountry,
       CreatedDate,
       LastModifiedDate
FROM Account
ORDER BY LastModifiedDate DESC
LIMIT 100
```

### Create Account

```http
POST /api/accounts
Authorization: Bearer <cognito-access-token>
Content-Type: application/json
```

Request:

```json
{
  "name": "Example Company",
  "accountNumber": "AC-1001",
  "type": "Customer - Direct",
  "industry": "Technology",
  "annualRevenue": 1000000,
  "numberOfEmployees": 25,
  "ownership": "Private",
  "rating": "Hot",
  "phone": "+63 912 345 6789",
  "fax": "+63 2 1234 5678",
  "website": "https://example.com",
  "description": "Example Account",
  "billingStreet": "123 Example Street",
  "billingCity": "Makati",
  "billingState": "Metro Manila",
  "billingPostalCode": "1200",
  "billingCountry": "Philippines",
  "shippingStreet": "123 Example Street",
  "shippingCity": "Makati",
  "shippingState": "Metro Manila",
  "shippingPostalCode": "1200",
  "shippingCountry": "Philippines"
}
```

Response:

```json
{
  "data": {
    "id": "001000000000001AAA",
    "name": "Example Company"
  }
}
```

Return HTTP `201 Created` for a successful creation.

### Update Account

```http
PATCH /api/accounts/:id
Authorization: Bearer <cognito-access-token>
Content-Type: application/json
```

The request body may contain any writable Account fields from the create contract. `name` remains required when the service or Salesforce requires it.

Response:

```json
{
  "data": {
    "id": "001000000000001AAA",
    "updated": true
  }
}
```

Return HTTP `200 OK` for a successful update.

### Error response

Use one stable error shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Name is required.",
    "requestId": "req_123"
  }
}
```

Do not return raw Salesforce response bodies to the browser.

Recommended error codes:

| Condition | HTTP status | Application code |
|---|---:|---|
| Missing or invalid input | 400 | `VALIDATION_ERROR` |
| Missing or invalid JWT | 401 | `UNAUTHORIZED` |
| Cognito user lacks permission | 403 | `FORBIDDEN` |
| Account not found | 404 | `ACCOUNT_NOT_FOUND` |
| Salesforce rejected the request | 422 | `SALESFORCE_REJECTED` |
| Salesforce rate limit | 429 | `RATE_LIMITED` |
| Salesforce unavailable | 503 | `INTEGRATION_UNAVAILABLE` |
| Unexpected backend failure | 500 | `INTERNAL_ERROR` |

---

## 7. Account field model

Use an explicit application field model. Do not dynamically expose every Salesforce field in the first implementation.

### Writable fields

| Application field | Salesforce field | Type | Required |
|---|---|---|---|
| `name` | `Name` | string | Yes |
| `accountNumber` | `AccountNumber` | string | No |
| `type` | `Type` | string | No |
| `parentId` | `ParentId` | Salesforce ID | No |
| `industry` | `Industry` | string | No |
| `annualRevenue` | `AnnualRevenue` | number | No |
| `numberOfEmployees` | `NumberOfEmployees` | integer | No |
| `ownership` | `Ownership` | string | No |
| `rating` | `Rating` | string | No |
| `phone` | `Phone` | string | No |
| `fax` | `Fax` | string | No |
| `website` | `Website` | URL string | No |
| `description` | `Description` | string | No |
| `billingStreet` | `BillingStreet` | string | No |
| `billingCity` | `BillingCity` | string | No |
| `billingState` | `BillingState` | string | No |
| `billingPostalCode` | `BillingPostalCode` | string | No |
| `billingCountry` | `BillingCountry` | string | No |
| `shippingStreet` | `ShippingStreet` | string | No |
| `shippingCity` | `ShippingCity` | string | No |
| `shippingState` | `ShippingState` | string | No |
| `shippingPostalCode` | `ShippingPostalCode` | string | No |
| `shippingCountry` | `ShippingCountry` | string | No |

### Read-only fields

These may be displayed but must not be accepted in create or update requests:

- `id` / `Id`
- `createdDate` / `CreatedDate`
- `lastModifiedDate` / `LastModifiedDate`
- Salesforce audit fields
- Salesforce system metadata

If the Salesforce org has custom Account fields, add them after confirming their API names and data types.

---

## 8. Backend implementation details

### Hono application

Create the Hono app in `apps/api/src/app.ts` and keep the Lambda adapter in `apps/api/src/index.ts`.

Suggested route composition:

```ts
const app = new Hono()

app.use('*', requestContextMiddleware)
app.onError(errorHandler)

app.route('/api/health', healthRoutes)
app.route('/api/integration', integrationStatusRoutes)
app.route('/api/accounts', accountsRoutes)

export default app
```

### Request context

Create or extract a request ID for every request.

The request ID should be:

- written to every related log entry;
- returned in error responses;
- safe to show to the user for support purposes.

The Cognito JWT has already been validated by API Gateway. Lambda may read the claims passed by API Gateway for logging, but the first release does not need user-specific authorization logic.

### Salesforce authentication service

Responsibilities:

- Load configuration from a secrets provider.
- Request a Salesforce access token.
- Cache the access token in module memory.
- Track token expiry.
- Invalidate the token after a Salesforce `401`.
- Retry token acquisition once.

Do not treat the in-memory cache as durable storage. Every new Lambda execution environment must be able to obtain a new token from Secrets Manager.

Suggested interface:

```ts
export interface SalesforceAuthService {
  getAccessToken(): Promise<{
    accessToken: string
    instanceUrl: string
  }>

  invalidateAccessToken(): void
}
```

### Salesforce client

The client should provide low-level HTTP methods and hide Salesforce URL construction.

Suggested interface:

```ts
export interface SalesforceClient {
  query<T>(soql: string): Promise<T>
  create<T>(objectName: string, payload: unknown): Promise<T>
  update(objectName: string, recordId: string, payload: unknown): Promise<void>
}
```

The client must:

- set the Salesforce Bearer authorization header;
- set JSON content headers for create and update;
- apply a request timeout;
- handle non-2xx responses;
- redact authorization headers from logs;
- expose normalized status information to the service layer.

### Account service

The Account service should:

- own the fixed SOQL query;
- map Salesforce fields to application fields;
- map application fields to Salesforce fields;
- remove empty optional values where appropriate;
- reject unknown or read-only fields;
- validate Salesforce IDs for update requests;
- return application DTOs rather than raw Salesforce responses.

Suggested methods:

```ts
export interface SalesforceAccountService {
  listAccounts(): Promise<Account[]>
  createAccount(input: CreateAccountInput): Promise<CreatedAccount>
  updateAccount(id: string, input: UpdateAccountInput): Promise<UpdatedAccount>
}
```

---

## 9. Frontend implementation details

### Pages and components

Minimum UI:

```text
App
└── AuthenticatedApp
    ├── AppHeader
    │   ├── Application title
    │   └── Sign out button
    └── AccountPage
        ├── AccountForm
        ├── AccountsTable
        ├── LoadingState
        ├── EmptyState
        └── ErrorState
```

### Account table

Display:

- Account Name
- Account Number
- Type
- Industry
- Phone
- Website
- Billing City
- Billing Country
- Last Modified Date
- Edit action

The table should be readable on smaller screens. Use a responsive layout or horizontal scrolling rather than hiding important fields silently.

### Account form

Use one form for both creation and update.

Behavior:

- Create mode has an empty form.
- Edit mode loads the selected Account values.
- Submit is disabled while the request is running.
- Validation errors appear near the relevant fields.
- Successful create or update closes or resets the form.
- The Account list refreshes after success.
- The user sees a success notification.

### API client

The API client should:

- obtain the current Cognito access token;
- send `Authorization: Bearer <token>`;
- parse the standard success and error shapes;
- throw typed application errors;
- avoid exposing raw response bodies in UI errors.

Do not put Salesforce URLs or credentials in frontend configuration.

---

## 10. AWS CDK implementation

### CDK resources

Define these resources in TypeScript:

```text
FrontendStack
├── Private S3 bucket
└── CloudFront distribution

IdentityStack
├── Cognito User Pool
├── Cognito public app client
└── Cognito Managed Login domain/configuration

ApiStack
├── Lambda function
├── API Gateway HTTP API
├── JWT authorizer using Cognito issuer
├── Routes for health, integration and accounts
├── IAM role
├── Secrets Manager secret/reference
└── CloudWatch log group
```

The exact CDK stack split may be combined into one stack for the assignment, but keep the logical boundaries clear.

### Lambda configuration

Lambda should receive only non-secret configuration as environment variables:

```text
SALESFORCE_SECRET_ARN
SALESFORCE_API_VERSION
LOG_LEVEL
```

The Salesforce client ID, client secret, login URL and optional JWT private key must be read from Secrets Manager.

Example secret shape:

```json
{
  "clientId": "replace-out-of-band",
  "clientSecret": "replace-out-of-band",
  "loginUrl": "https://login.salesforce.com",
  "privateKey": "optional-for-jwt-bearer-flow"
}
```

Do not commit real values. Do not place this secret in a frontend environment variable.

### IAM permissions

Lambda should have permission to:

- read one specific Secrets Manager secret;
- write logs to its CloudWatch log group.

Lambda should not have permission to:

- read arbitrary secrets;
- access S3 objects unless explicitly needed;
- write to application databases;
- administer AWS resources.

### CloudFront and frontend deployment

The deployment process should:

1. Build the React application.
2. Upload the build output to the frontend bucket.
3. Invalidate or version the CloudFront cache.
4. Output the CloudFront URL.

Do not put Salesforce secrets into the React build.

### CORS

Allow only the deployed frontend origin in production.

For local development, allow the configured local origin explicitly. Do not use unrestricted `*` CORS when authenticated API requests are enabled.

---

## 11. Configuration files

Use separate configuration for local, staging and production.

### Frontend configuration

Safe public values may include:

```text
VITE_API_BASE_URL
VITE_COGNITO_USER_POOL_ID
VITE_COGNITO_CLIENT_ID
VITE_COGNITO_DOMAIN
VITE_COGNITO_REDIRECT_URI
```

These values are not Salesforce secrets. Do not put a Cognito app client secret in the frontend.

### Backend configuration

```text
SALESFORCE_SECRET_ARN
SALESFORCE_API_VERSION
LOG_LEVEL
ALLOWED_ORIGIN
```

Use a schema to validate configuration at startup.

If required configuration is missing, return a controlled `not_configured` status and log a redacted configuration error. Do not log secret values.

---

## 12. Error handling and reliability

### Salesforce status handling

| Salesforce condition | Backend behavior |
|---|---|
| `401 Unauthorized` | Invalidate cached token, reacquire once, retry once |
| `400 Bad Request` | Return `SALESFORCE_REJECTED` with safe message |
| `403 Forbidden` | Return `INTEGRATION_FORBIDDEN` |
| `404 Not Found` | Return `ACCOUNT_NOT_FOUND` or integration error |
| `429 Too Many Requests` | Return `RATE_LIMITED`; do not aggressively retry |
| `5xx` | Return `INTEGRATION_UNAVAILABLE` |
| Timeout | Return `INTEGRATION_UNAVAILABLE` |

### Logging

Log structured fields:

```text
timestamp
level
requestId
route
method
durationMs
outcome
upstreamStatus
```

Never log:

- Salesforce client secrets;
- Salesforce access tokens;
- Cognito access or ID tokens;
- Authorization headers;
- private keys;
- full request bodies;
- full Salesforce response bodies.

Set CloudWatch log retention explicitly.

---

## 13. Testing strategy

### Unit tests

Test:

- Account request validation;
- create and update field mapping;
- read-only field rejection;
- URL validation;
- Salesforce ID validation;
- token cache and expiry behavior;
- Salesforce error normalization;
- response DTO mapping.

### API tests

Test:

- `GET /api/health`;
- missing JWT behavior;
- invalid JWT behavior through the deployed authorizer;
- `GET /api/accounts`;
- valid `POST /api/accounts`;
- invalid `POST /api/accounts`;
- valid `PATCH /api/accounts/:id`;
- invalid Account ID;
- Salesforce `401` retry;
- Salesforce `403`, `429` and `5xx` handling.

Mock Salesforce for most API tests. Use a real Salesforce integration test for the final end-to-end validation.

### Frontend tests

Test:

- unauthenticated redirect to Cognito;
- authenticated page rendering;
- Accounts loading state;
- empty state;
- table rendering;
- required field validation;
- create success and list refresh;
- update success and list refresh;
- API error display;
- sign-out behavior.

### Deployment smoke test

After deployment:

1. Open the CloudFront URL.
2. Sign in through Cognito.
3. Confirm the Accounts table loads.
4. Create a test Account.
5. Confirm the record exists in Salesforce.
6. Update the test Account.
7. Confirm the updated value appears in Salesforce and the UI.
8. Confirm CloudWatch logs contain no credentials or tokens.

---

## 14. Implementation sequence for the coding agent

Implement in the following order. Do not build all features at once.

### Step 1: Inspect and scaffold

- Inspect the repository and existing conventions.
- Confirm Node.js, package manager and TypeScript versions.
- Create the application structure.
- Add workspace scripts for linting, type checking and testing.
- Do not deploy infrastructure yet.

### Step 2: Build the backend vertical slice

- Implement `/api/health`.
- Implement configuration validation.
- Implement Secrets Manager access behind an interface.
- Implement Salesforce authentication.
- Implement the Salesforce client.
- Implement `GET /api/accounts`.
- Add unit and API tests.

Exit criterion: the backend can list Accounts from Salesforce in a controlled test environment.

### Step 3: Add create and update

- Add explicit Account schemas.
- Add field mapping.
- Implement `POST /api/accounts`.
- Implement `PATCH /api/accounts/:id`.
- Add Salesforce error normalization.
- Add tests for valid, invalid and upstream-failure cases.

Exit criterion: create and update work through the backend without exposing Salesforce credentials.

### Step 4: Add Cognito authentication

- Define the Cognito User Pool and public app client in CDK.
- Configure Managed Login and PKCE.
- Configure API Gateway JWT authorization.
- Add frontend login, logout and protected-route behavior.
- Add authenticated API client behavior.

Exit criterion: unauthenticated API requests fail and authenticated users can call the Account endpoints.

### Step 5: Build the frontend

- Build the Accounts table.
- Build the create/update form.
- Add loading, empty, validation, success and error states.
- Refresh data after create and update.
- Add responsive behavior.

Exit criterion: a logged-in user can list, create and update Accounts through the UI.

### Step 6: Add AWS infrastructure

- Define the CDK stacks.
- Add Lambda packaging and API Gateway routes.
- Add Secrets Manager reference and IAM permissions.
- Add CloudWatch log retention.
- Add S3 and CloudFront deployment.
- Configure CORS and environment-specific values.

Exit criterion: the complete application can be deployed from infrastructure code.

### Step 7: End-to-end verification

- Deploy to the agreed AWS account and region.
- Configure Salesforce credentials out of band.
- Create the first Cognito user.
- Run the smoke test.
- Check CloudWatch logs for sensitive data.
- Document the deployed URL and setup steps.

---

## 15. Coding-agent operating rules

The coding agent should follow these rules:

1. Inspect before editing.
2. Preserve unrelated user changes.
3. Implement one step at a time.
4. Do not add a database.
5. Do not hard-code secrets.
6. Do not expose Salesforce credentials to the browser.
7. Keep AWS-specific code inside infrastructure and adapters.
8. Add tests with each backend feature.
9. Run type checking, linting and tests after each meaningful change.
10. Report changed files, verification results and remaining risks.

Recommended prompt pattern:

```text
Inspect the current project and implement Step N from
salesforce-account-app-technical-implementation.md.

Before editing:
- summarize the current state;
- list the files you plan to change;
- identify any conflicts or missing information.

After editing:
- run the relevant tests, lint and type checks;
- report the files changed;
- report verification results;
- do not implement the next step yet.
```

---

## 16. Definition of done

The baseline implementation is complete when:

- AWS infrastructure is defined in CDK;
- the React app is deployed through S3 and CloudFront;
- Cognito protects the application and API;
- the Hono Lambda can authenticate to Salesforce;
- users can list Account records;
- users can create Account records;
- users can update Account records;
- the UI refreshes after create and update;
- validation and upstream errors are handled safely;
- Salesforce credentials never reach the browser;
- no separate application database is used;
- unit, API and frontend tests pass;
- an end-to-end smoke test has passed;
- setup, deployment and cleanup instructions are documented.

## 17. Future extensions, not part of the baseline

Do not implement these unless separately approved:

- Multiple Salesforce organizations;
- user-specific Salesforce connections;
- Salesforce interactive OAuth for each user;
- encrypted refresh-token persistence;
- application roles and permissions;
- search, pagination or advanced filtering;
- delete Accounts;
- audit history outside Salesforce;
- background synchronization;
- DynamoDB or RDS;
- multi-region deployment;
- complex CI/CD promotion pipelines.

