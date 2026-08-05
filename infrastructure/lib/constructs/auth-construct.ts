import { Duration, RemovalPolicy, Validations } from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import { Construct } from 'constructs'

/** OAuth scope required on every protected API route (D-11). */
export const API_SCOPE_NAME = 'access'
export const API_RESOURCE_SERVER_IDENTIFIER = 'accounts-api'
export const API_FULL_SCOPE = `${API_RESOURCE_SERVER_IDENTIFIER}/${API_SCOPE_NAME}`

export interface AuthConstructProps {
  /**
   * Exact allowlisted callback URLs. Sourced from CDK context
   * (`cognitoCallbackUrls`) which defaults to the URL implied by
   * `.env.example`'s `VITE_COGNITO_REDIRECT_URI`. Never hardcode.
   */
  readonly callbackUrls: string[]
  /**
   * Exact allowlisted logout URLs. Sourced from CDK context
   * (`cognitoLogoutUrls`) which defaults to the URL implied by
   * `.env.example`'s `VITE_COGNITO_LOGOUT_URI`. Never hardcode.
   */
  readonly logoutUrls: string[]
  /**
   * Cognito Hosted UI domain prefix. Must be globally unique across all AWS
   * accounts, so it is exposed as a context value (`cognitoDomainPrefix`)
   * rather than a fixed literal.
   */
  readonly domainPrefix: string
}

/**
 * Cognito identity provider for the staging environment.
 *
 * Implements D-09 (admin-created users only, self-sign-up disabled, MFA
 * disabled for staging) and D-11 (API resource server scope
 * `accounts-api/access`). MFA being off is a staging-only decision recorded
 * in the decision log; it must be reconsidered before any production
 * environment is created.
 */
export class AuthConstruct extends Construct {
  public readonly userPool: cognito.UserPool
  public readonly userPoolClient: cognito.UserPoolClient
  public readonly resourceServer: cognito.UserPoolResourceServer

  public constructor(scope: Construct, id: string, props: AuthConstructProps) {
    super(scope, id)

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      // D-09: admin-created users only; self-sign-up is never enabled.
      selfSignUpEnabled: false,
      signInAliases: { email: true, username: false },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(7),
      },
      // D-09: MFA is intentionally disabled for staging only. This must be
      // reconsidered (e.g. TOTP required) before any future production
      // environment, per SECURITY.md.
      mfa: cognito.Mfa.OFF,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // D-14: user pool holds admin-provisioned identities; retain until an
      // explicit, approved destruction decision.
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // D-09 (decision log): MFA is intentionally disabled for this
    // staging-only environment with admin-created users; must be
    // reconsidered before any production environment.
    Validations.of(this.userPool).acknowledge({
      id: 'AwsSolutions-COG2',
      reason:
        'D-09: MFA is intentionally disabled for this staging-only environment with admin-created users; must be reconsidered before any production environment.',
    })
    // Advanced security features add cost not justified for a 10-user
    // staging pool (D-02); admin-only provisioning and no self-sign-up
    // already bound the identity risk for this environment.
    Validations.of(this.userPool).acknowledge({
      id: 'AwsSolutions-COG3',
      reason:
        'Advanced security features add cost not justified for a 10-user staging pool (D-02); admin-only provisioning and no self-sign-up already bound the identity risk.',
    })
    // The Cognito Plus feature plan (advanced security features) is a paid
    // tier not required for a 10-user admin-provisioned staging pool
    // (D-02); it is out of scope for the USD 25/month staging budget
    // alarm (D-19).
    Validations.of(this.userPool).acknowledge({
      id: 'AwsSolutions-COG8',
      reason:
        'The Cognito Plus feature plan (advanced security features) is a paid tier not required for a 10-user admin-provisioned staging pool (D-02) and is out of scope for the USD 25/month staging budget alarm (D-19).',
    })

    this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: props.domainPrefix },
    })

    const scope_ = new cognito.ResourceServerScope({
      scopeName: API_SCOPE_NAME,
      scopeDescription: 'Read and write access to the Accounts API',
    })

    this.resourceServer = this.userPool.addResourceServer('ApiResourceServer', {
      identifier: API_RESOURCE_SERVER_IDENTIFIER,
      scopes: [scope_],
    })

    const apiScope = cognito.OAuthScope.resourceServer(
      this.resourceServer,
      scope_,
    )

    // Secretless SPA app client: Authorization Code + PKCE (S256) only.
    // The construct never enables the implicit grant, and a client without
    // a secret can only complete the Cognito Hosted UI authorization-code
    // flow using PKCE, satisfying D-10/SECURITY.md.
    this.userPoolClient = this.userPool.addClient('SpaClient', {
      generateSecret: false,
      authFlows: {
        userSrp: false,
        userPassword: false,
        adminUserPassword: false,
        custom: false,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
          clientCredentials: false,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, apiScope],
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(1),
    })
  }

  /** Base issuer URL used by the API Gateway JWT authorizer. */
  public get issuerUrl(): string {
    return `https://cognito-idp.${this.userPool.stack.region}.amazonaws.com/${this.userPool.userPoolId}`
  }
}
