import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'

import { ApiConstruct } from './constructs/api-construct.js'
import { AuthConstruct } from './constructs/auth-construct.js'
import { BudgetConstruct } from './constructs/budget-construct.js'
import { EdgeConstruct } from './constructs/edge-construct.js'

/** D-18: approved staging alarm notification recipient. */
const BUDGET_ALERT_EMAIL = 'diom.sea@gmail.com'

/**
 * Placeholder Salesforce secret ARN. The real secret is created out of band
 * in Milestone 3 by the Salesforce/platform owners; this stack only needs a
 * syntactically valid ARN to scope the Lambda's IAM read policy to exactly
 * one resource. Override with the real ARN via `-c salesforceSecretArn=...`
 * once it exists.
 */
const PLACEHOLDER_SALESFORCE_SECRET_ARN =
  'arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:salesforce-account-app/staging/salesforce-REPLAC-a1b2c3'

export interface StagingFoundationStackProps extends StackProps {
  /**
   * Exact Cognito callback URL allowlist. Defaults to the URL implied by
   * `.env.example`'s `VITE_COGNITO_REDIRECT_URI`.
   */
  readonly cognitoCallbackUrls?: string[]
  /**
   * Exact Cognito logout URL allowlist. Defaults to the URL implied by
   * `.env.example`'s `VITE_COGNITO_LOGOUT_URI`.
   */
  readonly cognitoLogoutUrls?: string[]
  /** Globally-unique Cognito Hosted UI domain prefix. */
  readonly cognitoDomainPrefix?: string
  /** ARN of the single Secrets Manager secret Lambda may read. */
  readonly salesforceSecretArn?: string
  /** Non-secret Salesforce API version, e.g. `v60.0`. */
  readonly salesforceApiVersion?: string
  readonly logLevel?: string
  /** CORS origin allowed to call the API directly (local dev / staging CloudFront). */
  readonly allowedOrigin?: string
  /** D-18 staging budget alarm recipient override, for tests only. */
  readonly budgetAlertEmail?: string
}

/**
 * Milestone 6 staging foundation: Cognito, API Gateway HTTP API + Lambda,
 * private S3 + CloudFront, and staging cost/retention controls.
 *
 * See docs/architecture/decision-log.md for the approved decisions this
 * stack implements (D-09, D-11, D-14, D-15, D-18, D-19) and
 * docs/implementation-plan.md Milestone 6 for the full deliverable list.
 */
export class StagingFoundationStack extends Stack {
  public constructor(
    scope: Construct,
    id: string,
    props: StagingFoundationStackProps = {},
  ) {
    super(scope, id, props)

    // .env.example: VITE_COGNITO_REDIRECT_URI=http://localhost:5173/auth/callback
    const callbackUrls = props.cognitoCallbackUrls ?? [
      'http://localhost:5173/auth/callback',
    ]
    // .env.example: VITE_COGNITO_LOGOUT_URI=http://localhost:5173/
    const logoutUrls = props.cognitoLogoutUrls ?? ['http://localhost:5173/']
    const domainPrefix =
      props.cognitoDomainPrefix ?? 'salesforce-account-app-staging'
    const salesforceSecretArn =
      props.salesforceSecretArn ?? PLACEHOLDER_SALESFORCE_SECRET_ARN
    const salesforceApiVersion = props.salesforceApiVersion ?? 'v60.0'
    const logLevel = props.logLevel ?? 'info'
    const allowedOrigin = props.allowedOrigin ?? 'http://localhost:5173'
    const budgetAlertEmail = props.budgetAlertEmail ?? BUDGET_ALERT_EMAIL

    const auth = new AuthConstruct(this, 'Auth', {
      callbackUrls,
      logoutUrls,
      domainPrefix,
    })

    const api = new ApiConstruct(this, 'Api', {
      auth,
      salesforceSecretArn,
      salesforceApiVersion,
      logLevel,
      allowedOrigin,
    })

    const edge = new EdgeConstruct(this, 'Edge', {
      httpApi: api.httpApi,
    })

    new BudgetConstruct(this, 'Budget', {
      alertEmail: budgetAlertEmail,
    })

    new CfnOutput(this, 'CloudFrontDomainName', {
      value: edge.distribution.distributionDomainName,
      description:
        'Staging CloudFront domain. Add it to cognitoCallbackUrls/cognitoLogoutUrls context after first deploy.',
    })
    new CfnOutput(this, 'CognitoUserPoolId', {
      value: auth.userPool.userPoolId,
    })
    new CfnOutput(this, 'CognitoUserPoolClientId', {
      value: auth.userPoolClient.userPoolClientId,
    })

    // Every remaining cdk-nag acknowledgment (D-09 MFA-off, the intentionally
    // public /api/health route, least-privilege Lambda logging role, the
    // access-log sink bucket, and CloudFront's optional geo/WAF controls) is
    // recorded next to the resource it applies to inside the construct that
    // creates it, using cdk-nag v3's `Validations.of(construct).acknowledge()`
    // API, each with a written justification.
  }
}
