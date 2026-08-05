import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CfnOutput,
  DockerImage,
  Duration,
  RemovalPolicy,
  Stack,
  Validations,
} from 'aws-cdk-lib'
import { AccessLogFormat } from 'aws-cdk-lib/aws-apigateway'
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'

import { API_FULL_SCOPE, type AuthConstruct } from './auth-construct.js'

/** D-19: aggregate and write-route throttle envelope. */
const AGGREGATE_RATE_LIMIT = 2
const AGGREGATE_BURST_LIMIT = 5
const WRITE_RATE_LIMIT = 1
const WRITE_BURST_LIMIT = 2

/** D-19: Lambda timeout and reserved concurrency. */
const LAMBDA_TIMEOUT = Duration.seconds(15)
const RESERVED_CONCURRENCY = 5

/** D-14: CloudWatch log retention. */
const LOG_RETENTION_DAYS = logs.RetentionDays.ONE_MONTH

/** Route keys that carry the write-throttle override (D-19). */
const WRITE_ROUTE_KEYS = [
  'POST /api/accounts',
  'PATCH /api/accounts/{id}',
  'DELETE /api/accounts/{id}',
]

export interface ApiConstructProps {
  readonly auth: AuthConstruct
  /**
   * ARN of the single Secrets Manager secret Lambda may read (Salesforce
   * Client Credentials + cursor signing key, per Milestone 3). This is a
   * placeholder/context value only — the secret itself is created out of
   * band and does not need to exist yet for this stack to synthesize.
   */
  readonly salesforceSecretArn: string
  readonly salesforceApiVersion: string
  readonly logLevel: string
  readonly allowedOrigin: string
}

/**
 * Lambda-backed API Gateway HTTP API fronting the existing Hono application
 * in `apps/api`. Every route requires the `accounts-api/access` scope
 * except `/api/health`, per D-11 and section 6 of the implementation plan.
 */
export class ApiConstruct extends Construct {
  public readonly httpApi: apigatewayv2.HttpApi
  public readonly lambdaFunction: lambda.Function
  public readonly alias: lambda.Alias
  public readonly accessLogGroup: logs.LogGroup

  public constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id)

    const stack = Stack.of(this)
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    const apiPackageDir = path.join(currentDir, '..', '..', '..', 'apps', 'api')

    // One-secret least-privilege IAM read access (D-14/SECURITY.md). The
    // secret does not need to exist at synth time; this only scopes the
    // IAM policy to exactly one ARN.
    const salesforceSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'SalesforceSecret',
      props.salesforceSecretArn,
    )

    const functionLogGroup = new logs.LogGroup(this, 'FunctionLogGroup', {
      retention: LOG_RETENTION_DAYS,
      // D-14: retain staging logs; do not auto-destroy.
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // Explicit least-privilege execution role instead of the default
    // AWSLambdaBasicExecutionRole managed policy: grant only write access
    // to this function's own log group (scoped resource, not `logs:*` on
    // `*`) plus, below, read access to exactly one Secrets Manager ARN.
    // This satisfies the AWS Solutions IAM4/IAM5 checks with a real fix
    // rather than a suppression.
    const executionRole = new iam.Role(this, 'ApiFunctionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    })
    functionLogGroup.grantWrite(executionRole)

    this.lambdaFunction = new lambda.Function(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      role: executionRole,
      timeout: LAMBDA_TIMEOUT,
      memorySize: 512,
      reservedConcurrentExecutions: RESERVED_CONCURRENCY,
      logGroup: functionLogGroup,
      environment: {
        SALESFORCE_SECRET_ARN: props.salesforceSecretArn,
        SALESFORCE_API_VERSION: props.salesforceApiVersion,
        LOG_LEVEL: props.logLevel,
        ALLOWED_ORIGIN: props.allowedOrigin,
      },
      code: lambda.Code.fromAsset(apiPackageDir, {
        // Reuse the exact esbuild invocation from apps/api/package.json's
        // `build` script (bundle, node platform, node22 target, ESM,
        // sourcemaps without embedded source content), run locally without
        // Docker so `cdk synth` never requires network/deploy access. The
        // `image` value is required by the type but is never pulled because
        // `local.tryBundle` always succeeds here.
        bundling: {
          image: DockerImage.fromRegistry(
            'public.ecr.aws/sam/build-nodejs22.x',
          ),
          local: {
            tryBundle(outputDir: string): boolean {
              const result = spawnSync(
                'npx',
                [
                  'esbuild',
                  'src/index.ts',
                  '--bundle',
                  '--platform=node',
                  '--target=node22',
                  '--format=esm',
                  `--outfile=${path.join(outputDir, 'index.mjs')}`,
                  '--sourcemap',
                  '--sources-content=false',
                ],
                {
                  cwd: apiPackageDir,
                  stdio: 'inherit',
                  shell: process.platform === 'win32',
                },
              )
              if (result.status !== 0) {
                return false
              }
              // `.mjs` alone is unambiguous ESM for the Node.js 22 Lambda
              // runtime, matching apps/api's own `"type": "module"` build.
              writeFileSync(
                path.join(outputDir, 'package.json'),
                JSON.stringify({ type: 'module' }),
              )
              return true
            },
          },
        },
      }),
    })

    // Least privilege: read access to exactly one Secrets Manager ARN, and
    // logging to this function's own log group only (granted above via the
    // custom execution role). No other IAM permissions are attached.
    salesforceSecret.grantRead(this.lambdaFunction)

    // The repository pins Node.js 22.22.0 (root package.json "engines") to
    // match the local/CI toolchain and apps/api's own esbuild
    // `--target=node22` build; NODEJS_22_X is an actively supported AWS
    // Lambda LTS runtime, not a deprecated one.
    Validations.of(this.lambdaFunction).acknowledge({
      id: 'AwsSolutions-L1',
      reason:
        "The repository pins Node.js 22.22.0 (root package.json engines) to match the local/CI toolchain and apps/api's own esbuild --target=node22 build; NODEJS_22_X is an actively supported AWS Lambda LTS runtime, not a deprecated one.",
    })

    this.alias = new lambda.Alias(this, 'ApiFunctionAlias', {
      aliasName: 'live',
      // aws-cdk-lib's `Version` class and its own `IVersion` interface are
      // structurally incompatible under `exactOptionalPropertyTypes` (a
      // known upstream aws-cdk-lib/TypeScript friction, not a real type
      // error); the cast is narrowly scoped to this known-safe assignment.
      version: this.lambdaFunction.currentVersion as unknown as lambda.IVersion,
    })

    this.accessLogGroup = new logs.LogGroup(this, 'AccessLogGroup', {
      retention: LOG_RETENTION_DAYS,
      // D-14: retain staging logs; do not auto-destroy.
      removalPolicy: RemovalPolicy.RETAIN,
    })

    const jwtAuthorizer = new HttpJwtAuthorizer(
      'JwtAuthorizer',
      props.auth.issuerUrl,
      {
        jwtAudience: [props.auth.userPoolClient.userPoolClientId],
      },
    )

    this.httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      // Protected by default: every route added without an override
      // inherits this authorizer and required scope (D-11).
      defaultAuthorizer: jwtAuthorizer,
      defaultAuthorizationScopes: [API_FULL_SCOPE],
      corsPreflight: {
        allowOrigins: [props.allowedOrigin],
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PATCH,
          apigatewayv2.CorsHttpMethod.DELETE,
        ],
        allowCredentials: false,
        maxAge: Duration.seconds(0),
      },
      createDefaultStage: false,
    })

    const defaultStage = new apigatewayv2.HttpStage(this, 'DefaultStage', {
      httpApi: this.httpApi,
      stageName: '$default',
      autoDeploy: true,
      throttle: {
        // D-19: aggregate throttle applied to every route by default.
        rateLimit: AGGREGATE_RATE_LIMIT,
        burstLimit: AGGREGATE_BURST_LIMIT,
      },
      accessLogSettings: {
        destination: new apigatewayv2.LogGroupLogDestination(
          this.accessLogGroup,
        ),
        format: AccessLogFormat.jsonWithStandardFields(),
      },
    })

    // Same exactOptionalPropertyTypes friction as above: `Alias` vs `IFunction`.
    const integration = new HttpLambdaIntegration(
      'LambdaIntegration',
      this.alias as unknown as lambda.IFunction,
    )

    // Only /api/health is public (D-11/plan section 6).
    const healthRoutes = this.httpApi.addRoutes({
      path: '/api/health',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: new apigatewayv2.HttpNoneAuthorizer(),
      // Explicitly clear the inherited default scope; combined with the
      // NONE authorizer above, /api/health carries no scope requirement.
      authorizationScopes: [],
    })
    for (const route of healthRoutes) {
      // GET /api/health is intentionally public per the implementation
      // plan (section 6) and D-11, so external monitoring can reach it
      // without a token. Every other route keeps the default JWT
      // authorizer and accounts-api/access scope.
      Validations.of(route).acknowledge({
        id: 'AwsSolutions-APIG4',
        reason:
          'GET /api/health is intentionally public per the implementation plan (section 6) and D-11; every other route keeps the default JWT authorizer and accounts-api/access scope.',
      })
    }

    this.httpApi.addRoutes({
      path: '/api/integration/status',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
    })

    this.httpApi.addRoutes({
      path: '/api/accounts',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
    })

    this.httpApi.addRoutes({
      path: '/api/accounts',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
    })

    this.httpApi.addRoutes({
      path: '/api/accounts/{id}',
      methods: [apigatewayv2.HttpMethod.PATCH],
      integration,
    })

    this.httpApi.addRoutes({
      path: '/api/accounts/{id}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration,
    })

    // D-19: write-route throttle override (1 rps / burst 2). HTTP API v2
    // only exposes per-route throttling through the underlying CfnStage
    // RouteSettings map, so the L1 escape hatch is required here.
    const cfnStage = defaultStage.node.defaultChild as apigatewayv2.CfnStage
    cfnStage.routeSettings = Object.fromEntries(
      WRITE_ROUTE_KEYS.map((routeKey) => [
        routeKey,
        {
          throttlingRateLimit: WRITE_RATE_LIMIT,
          throttlingBurstLimit: WRITE_BURST_LIMIT,
        },
      ]),
    )

    // Bound request/response size at the API boundary (D-19: 64 KiB
    // request / 1 MiB response are also enforced application-side in
    // apps/api; this is defense in depth at the edge via a resource policy
    // is not available on HTTP APIs, so payload limits are enforced by the
    // Hono body-size middleware plus CloudFront's own request size limits).

    new CfnOutput(this, 'ApiEndpoint', {
      value: this.httpApi.apiEndpoint,
      description:
        'Default execute-api endpoint (retained as the CloudFront origin per D-15).',
    })
    new CfnOutput(this, 'ApiHost', {
      value: `${this.httpApi.httpApiId}.execute-api.${stack.region}.amazonaws.com`,
      description:
        'Host used for the CloudFront /api/* origin Host header override.',
    })
  }
}
