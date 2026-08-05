export {
  DEFAULT_TOKEN_TTL_SECONDS,
  readSalesforceEnvironmentConfig,
  SALESFORCE_REQUEST_TIMEOUT_MS,
  TOKEN_EXPIRY_SKEW_MS,
  type SalesforceEnvironmentConfig,
} from './config.js'
export {
  assertAllowedSalesforceHost,
  isAllowedSalesforceHost,
} from './host-allowlist.js'
export {
  createBoundedFetch,
  type BoundedFetch,
  type BoundedFetchDependencies,
  type FetchLike,
} from './http-client.js'
export {
  createNoopSalesforceLogger,
  type SalesforceLogEvent,
  type SalesforceLogger,
} from './logger.js'
export {
  createSecretsProvider,
  salesforceSecretSchema,
  type SalesforceSecret,
  type SecretsProvider,
  type SecretsProviderDependencies,
} from './secrets-provider.js'
export {
  createTokenProvider,
  type CachedSalesforceToken,
  type GetTokenOptions,
  type TokenProvider,
  type TokenProviderDependencies,
} from './token-provider.js'
export {
  createSalesforceClient,
  type SalesforceClient,
  type SalesforceClientDependencies,
  type SalesforceRequestInput,
  type SalesforceResponse,
} from './client.js'
