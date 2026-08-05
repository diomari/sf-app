# Salesforce Account Management App

## Technical Implementation Specification

**Status:** Phase 1 implementation basis, amended 2026-08-05

**Deployment:** One staging environment in AWS Singapore (`ap-southeast-1`)
**Primary system of record:** Salesforce  
**Application database:** None in the baseline release  
**Scope:** Application login, Salesforce Account listing, creation and update

---

## 1. Objective

Build a small web application that allows an authenticated application user to:

1. Sign in to the application.
2. Search Salesforce Accounts by Account Name or Account Number.
3. View Salesforce Account records in a paginated table with 50 records per page.
4. Create a new Salesforce Account.
5. Update an existing Salesforce Account.
6. Delete an existing Salesforce Account after explicit confirmation.
7. See the latest data after a successful create, update or delete.

Salesforce remains the authoritative store for Account records. The application must not copy Account records into DynamoDB, RDS or another application database.

The application is a secure frontend and API layer over Salesforce.

---

## 2. Confirmed implementation decisions

| Decision | Baseline implementation |
|---|---|
| Deployment | One direct staging environment in AWS Singapore (`ap-southeast-1`); no production environment |
| Frontend | React, Vite and TypeScript |
| Backend | Hono, TypeScript and AWS Lambda |
| API entry point | API Gateway HTTP API |
| Application login | Amazon Cognito User Pool with Managed Login and Authorization Code + PKCE |
| API authorization | API Gateway HTTP API JWT authorizer |
| Salesforce authentication | OAuth Client Credentials Flow using a dedicated integration user |
| Salesforce fallback | None in staging; fail closed if Client Credentials is not configured |
| Salesforce integration | Salesforce REST API |
| Infrastructure | AWS CDK with TypeScript |
| Secrets | AWS Secrets Manager |
| Logging | CloudWatch Logs |
| Business-data storage | Salesforce only |
| Initial Account operations | Search, paginated list (50/page), create, update and delete |

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

- Render login, Account search, paginated Account table, Account form and delete confirmation.
- Start Cognito Managed Login.
- Attach the Cognito access token to API requests.
- Display loading, empty, success and error states.
- Perform basic client-side validation for usability.
- Never contain Salesforce client secrets or Salesforce tokens.

#### CloudFront and S3

- Serve the compiled React application over HTTPS.
- Keep the S3 bucket private with S3 Block Public Access and CloudFront Origin Access Control.
- Route browser `/api/*` calls through CloudFront to the API Gateway default endpoint. No custom domain is used in staging; the directly reachable API endpoint must enforce the same JWT, throttling, payload and no-cache controls.
- Configure the API origin request policy so CloudFront uses the API Gateway origin host and does not forward the viewer `Host` header. Forward only required headers, query strings and methods, and verify `/api/*` routing with a CDK assertion and deployed test.

#### Cognito User Pool

- Manage application users.
- Provide Managed Login.
- Issue JWT access tokens using Authorization Code + PKCE.
- Use admin-created users only; disable self-sign-up and leave MFA disabled for this staging environment.

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
- Search, page through, create, update and delete Salesforce Accounts.
- Normalize Salesforce errors into application errors.
- Write redacted structured logs.

#### Salesforce

- Store Account records.
- Authenticate the backend integration user.
- Execute the approved SOQL query.
- Create, update and delete Account records through the REST API.

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
- Use only the Cognito access token for API authorization.
- Define the Cognito resource-server scope `accounts-api/access` and request it in the frontend authorization flow.
- Configure the API Gateway JWT authorizer with the Cognito issuer URL and audience/client ID, and configure `authorizationScopes: ['accounts-api/access']` on every protected route. ID tokens and access tokens without the scope must be rejected.
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

Client Credentials is the only approved staging authentication mode. If it is unavailable or incomplete, fail closed and report `not_configured`; do not fall back to JWT Bearer Flow without a new approved architecture decision.

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

All routes except `/api/health` require a valid Cognito access token containing the `accounts-api/access` scope. API Gateway must enforce the scope at each protected route; a valid ID token is not sufficient.

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
GET /api/accounts?search=example&cursor=<opaque-cursor>
Authorization: Bearer <cognito-access-token>
```

Both query parameters are optional. The fixed page size is 50. When present after trimming, `search` must contain 2–100 characters and is applied only to Account `Name` and `AccountNumber`; reject other lengths with `VALIDATION_ERROR`. The backend must safely escape the search literal and must never concatenate unvalidated syntax into SOQL.

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
  ],
  "meta": {
    "pageSize": 50,
    "hasMore": true,
    "nextCursor": "opaque-signed-cursor"
  }
}
```

The backend owns the SOQL templates. Do not accept raw SOQL, object names, field lists, offsets or Salesforce `nextRecordsUrl` values from the browser. Pagination must use a signed opaque keyset cursor containing only the approved ordering keys and a hash of the normalized search criteria. Sign with HMAC-SHA256 using the Secrets Manager cursor key and expire cursors after 15 minutes. Reject expired, malformed, tampered or search-mismatched cursors.

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
ORDER BY LastModifiedDate DESC, Id DESC
LIMIT 51
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
If-Unmodified-Since: Tue, 05 Aug 2026 10:00:00 GMT
Content-Type: application/json
```

The request body may contain any writable Account fields from the create contract. PATCH may omit `name`, but when supplied, `name` must be a nonblank, non-null string. Reject an empty body. Require `If-Unmodified-Since`, derived from the Account's `lastModifiedDate`; return `428 PRECONDITION_REQUIRED` when absent or invalid. Pass the validated precondition to Salesforce and return `412 PRECONDITION_FAILED` when the record changed after that timestamp.

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

### Delete Account

```http
DELETE /api/accounts/:id
Authorization: Bearer <cognito-access-token>
```

Return HTTP `204 No Content` after Salesforce accepts the deletion. Validate that the ID is a canonical Account ID. The UI must require explicit confirmation that displays the Account name. Do not automatically retry a delete after a timeout, network failure, `429` or `5xx`, because the outcome may be ambiguous. Normalize Salesforce dependency, permission and validation failures without returning raw response bodies.

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
| Update precondition missing or invalid | 428 | `PRECONDITION_REQUIRED` |
| Concurrent update conflict | 412 | `PRECONDITION_FAILED` |
| Salesforce rejected the request, including a blocked delete | 422 | `SALESFORCE_REJECTED` |
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
  create<T>(objectName: 'Account', payload: unknown): Promise<T>
  update(
    objectName: 'Account',
    recordId: string,
    payload: unknown,
    ifUnmodifiedSince: string
  ): Promise<void>
  delete(objectName: 'Account', recordId: string): Promise<void>
}
```

The client must:

- set the Salesforce Bearer authorization header;
- set JSON content headers for create and update and `If-Unmodified-Since` for update;
- expose only a fixed Account delete operation;
- apply a request timeout;
- handle non-2xx responses;
- redact authorization headers from logs;
- expose normalized status information to the service layer.

### Account service

The Account service should:

- own fixed SOQL templates for list, search and keyset pagination;
- map Salesforce fields to application fields;
- map application fields to Salesforce fields;
- remove empty optional values where appropriate;
- reject unknown or read-only fields;
- validate Salesforce IDs for update and delete requests;
- create and verify signed opaque cursors bound to normalized search criteria;
- delete only Account records and never retry an ambiguous delete;
- return application DTOs rather than raw Salesforce responses.

Suggested methods:

```ts
export interface SalesforceAccountService {
  listAccounts(input: { search?: string; cursor?: string }): Promise<{
    data: Account[]
    meta: { pageSize: 50; hasMore: boolean; nextCursor: string | null }
  }>
  createAccount(input: CreateAccountInput): Promise<CreatedAccount>
  updateAccount(
    id: string,
    input: UpdateAccountInput,
    ifUnmodifiedSince: string
  ): Promise<UpdatedAccount>
  deleteAccount(id: string): Promise<void>
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
        ├── AccountSearch
        ├── AccountForm
        ├── AccountsTable
        ├── PaginationControls
        ├── DeleteConfirmation
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
- Delete action

Search is debounced, keyboard accessible, and resets pagination when the term changes. Pagination uses only backend-issued cursors and provides previous/next controls; the frontend may keep the cursor history for the current browser session.

The table should be readable on smaller screens. Use a responsive layout or horizontal scrolling rather than hiding important fields silently.

### Account form

Use one form for both creation and update.

Behavior:

- Create mode has an empty form.
- Edit mode loads the selected Account values.
- Submit is disabled while the request is running.
- Validation errors appear near the relevant fields.
- Successful create or update closes or resets the form.
- Delete requires an explicit confirmation showing the Account name and disables controls while pending.
- The current Account page refreshes after successful create, update or delete.
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

The Salesforce client ID, client secret, approved sandbox login/My Domain URL and cursor-signing key must be read from Secrets Manager.

Example secret shape:

```json
{
  "clientId": "replace-out-of-band",
  "clientSecret": "replace-out-of-band",
  "loginUrl": "https://replace-with-approved-sandbox-my-domain",
  "cursorSigningKey": "replace-with-random-32-byte-or-stronger-secret"
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

Allow only the generated staging CloudFront origin in the deployed environment. The API Gateway endpoint remains directly reachable because no custom domain is available, but CORS is not an authorization control; JWT scope validation and throttling must protect both access paths.

For local development, allow the configured local origin explicitly. Do not use unrestricted `*` CORS when authenticated API requests are enabled.

---

## 11. Configuration files

Use separate local developer configuration and one deployed staging configuration. Production configuration is out of scope.

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

### Approved staging limits

- Maximum request body: 64 KiB, enforced before JSON processing where practical.
- Maximum serialized API response: 1 MiB.
- API Gateway aggregate throttle: 2 requests/second with burst 5.
- Create, update and delete route throttle: 1 request/second with burst 2.
- Lambda reserved concurrency: 5.
- Lambda timeout: 15 seconds.
- Salesforce request timeout: 10 seconds, or earlier when remaining Lambda time requires it.
- CloudWatch log retention: 30 days.
- AWS monthly budget alarm: USD 25.
- Alarm recipient: `diom.sea@gmail.com`.
- Salesforce daily and concurrent API quotas must be confirmed before deployment.

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
- search terms or cursor contents;
- full Salesforce response bodies.

Set CloudWatch log retention to 30 days and route staging operational and budget alarms to `diom.sea@gmail.com`.

---

## 13. Testing strategy

### Unit tests

Test:

- Account request validation;
- create and update field mapping;
- search normalization and SOQL literal escaping;
- cursor signing, expiry, tamper detection and search binding;
- delete ID validation and ambiguous-failure non-retry behavior;
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
- Cognito ID-token rejection and access-token rejection for missing/wrong `accounts-api/access` scope, issuer, audience/client or expiry;
- `GET /api/accounts` with first page, next cursor, final page and 50-record limit;
- Account Name and Account Number search, normalization and safely escaped special characters;
- malformed, expired, tampered and search-mismatched cursors;
- valid `POST /api/accounts`;
- invalid `POST /api/accounts`;
- valid `PATCH /api/accounts/:id`, missing/invalid `If-Unmodified-Since` (`428`) and stale precondition (`412`);
- valid and rejected `DELETE /api/accounts/:id`;
- delete confirmation is a frontend requirement and delete is not retried after ambiguous failure;
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
- table rendering and 50-item cursor pagination;
- debounced Name/Account Number search and pagination reset;
- required field validation;
- create success and list refresh;
- update success and list refresh;
- delete confirmation, cancellation, success and list refresh;
- API error display;
- sign-out behavior.

### Deployment smoke test

After deployment:

1. Open the CloudFront URL.
2. Sign in through Cognito.
3. Confirm the Accounts table loads.
4. Create a test Account.
5. Confirm the record exists in Salesforce.
6. Search for the test Account and exercise next/previous pagination when enough disposable records exist.
7. Update the test Account.
8. Confirm the updated value appears in Salesforce and the UI.
9. Delete the test Account after explicit confirmation and verify it no longer appears in the active Salesforce Account list.
10. Confirm CloudWatch logs contain no credentials, tokens, search terms or Account payload values.

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
- Implement `GET /api/accounts` with bounded Name/Account Number search and signed cursor pagination at 50 records per page.
- Add unit and API tests.

Exit criterion: the backend can search and page through Accounts from Salesforce in a controlled test environment without exposing query or cursor internals.

### Step 3: Add create, update and delete

- Add explicit Account schemas.
- Add field mapping.
- Implement `POST /api/accounts`.
- Implement `PATCH /api/accounts/:id`.
- Implement `DELETE /api/accounts/:id` with ID validation and no ambiguous-failure retry.
- Add Salesforce error normalization.
- Add tests for valid, invalid and upstream-failure cases.

Exit criterion: create, update and delete work through the backend without exposing Salesforce credentials or accidentally repeating ambiguous writes.

### Step 4: Add Cognito authentication

- Define the Cognito User Pool and public app client in CDK.
- Configure Managed Login and PKCE.
- Configure API Gateway JWT authorization.
- Add frontend login, logout and protected-route behavior.
- Add authenticated API client behavior.

Exit criterion: unauthenticated API requests fail and authenticated users can call the Account endpoints.

### Step 5: Build the frontend

- Build Account Name/Account Number search and 50-record pagination controls.
- Build the Accounts table.
- Build the create/update form and delete confirmation.
- Add loading, empty, validation, success and error states.
- Refresh data after create, update and delete.
- Add responsive behavior.

Exit criterion: a logged-in user can search, paginate, create, update and delete Accounts through the UI.

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
- users can search Account Name and Account Number;
- users can page through Account records in 50-record pages;
- users can create Account records;
- users can update Account records;
- users can delete Account records after explicit confirmation;
- the UI refreshes after create, update and delete;
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
- advanced filtering beyond the approved Account Name and Account Number search;
- audit history outside Salesforce;
- background synchronization;
- DynamoDB or RDS;
- multi-region deployment;
- complex CI/CD promotion pipelines.

