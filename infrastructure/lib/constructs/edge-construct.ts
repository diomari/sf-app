import { Duration, RemovalPolicy, Validations } from 'aws-cdk-lib'
import type * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'

export interface EdgeConstructProps {
  readonly httpApi: apigatewayv2.HttpApi
}

/**
 * Private S3 origin (Block Public Access, no website hosting) served through
 * CloudFront with Origin Access Control, plus a cache-disabled `/api/*`
 * behavior proxying to the API Gateway default `execute-api` endpoint
 * (D-15: no custom domain, default endpoint retained as the CloudFront
 * origin).
 */
export class EdgeConstruct extends Construct {
  public readonly siteBucket: s3.Bucket
  public readonly distribution: cloudfront.Distribution
  public readonly accessLogsBucket: s3.Bucket

  public constructor(scope: Construct, id: string, props: EdgeConstructProps) {
    super(scope, id)

    // Sink bucket for both S3 server-access logs and CloudFront access
    // logs. It intentionally has no access-logging of its own (see the
    // cdk-nag suppression at the bottom of this construct) to avoid an
    // infinite logging chain.
    this.accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // S3 server-access-log delivery and CloudFront standard logging both
      // deliver via the legacy S3 Log Delivery group ACL, which requires
      // ACLs to remain enabled on the destination bucket (ObjectWriter);
      // BUCKET_OWNER_ENFORCED disables ACLs entirely and breaks delivery.
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      // D-14: stateful, retain until an explicit approved destruction.
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ expiration: Duration.days(30), enabled: true }],
    })

    // This bucket is itself the destination for S3 server-access logs and
    // CloudFront access logs; enabling access logging on the log sink
    // would create an unbounded self-referential logging loop.
    Validations.of(this.accessLogsBucket).acknowledge({
      id: 'AwsSolutions-S1',
      reason:
        'This bucket is itself the destination for S3 server-access logs and CloudFront access logs; enabling access logging on the log sink would create an unbounded self-referential logging loop.',
    })

    this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: true,
      // No website hosting: static assets are only ever served through
      // CloudFront via OAC, never as an S3 website endpoint.
      // D-14: stateful, retain until an explicit approved destruction.
      removalPolicy: RemovalPolicy.RETAIN,
      // aws-cdk-lib's `Bucket` class and its own `IBucket` interface are
      // structurally incompatible under `exactOptionalPropertyTypes`
      // (a known upstream aws-cdk-lib/TypeScript friction, not a real type
      // error); the cast is narrowly scoped to this known-safe assignment.
      serverAccessLogsBucket: this.accessLogsBucket as unknown as s3.IBucket,
      serverAccessLogsPrefix: 's3-access-logs/',
    })

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(
      this.siteBucket as unknown as s3.IBucket,
    )

    // The API Gateway default execute-api host, built directly from the
    // HttpApi's own id/region tokens (never from the CloudFront
    // distribution's own domain), so CloudFront always targets the API
    // Gateway host rather than forwarding the viewer's CloudFront host.
    const apiHost = `${props.httpApi.httpApiId}.execute-api.${props.httpApi.stack.region}.amazonaws.com`

    const apiOrigin = new origins.HttpOrigin(apiHost, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
    })

    const securityHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeadersPolicy',
      {
        comment: 'Baseline security response headers for the staging frontend.',
        securityHeadersBehavior: {
          contentSecurityPolicy: {
            contentSecurityPolicy: [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
            override: true,
          },
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy:
              cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: Duration.days(365),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          xssProtection: { protection: true, modeBlock: true, override: true },
        },
      },
    )

    // Immutable caching for hashed static assets; index.html itself is
    // served with short/no-cache via its own S3 metadata at upload time
    // (Milestone 9 deployment step), so the CloudFront default behavior
    // cache policy only needs to be safe for hashed assets.
    const staticAssetCachePolicy = new cloudfront.CachePolicy(
      this,
      'StaticAssetCachePolicy',
      {
        comment:
          'Long-lived caching for hashed static assets; honors S3 Cache-Control overrides.',
        defaultTtl: Duration.days(365),
        minTtl: Duration.seconds(0),
        maxTtl: Duration.days(365),
        enableAcceptEncodingBrotli: true,
        enableAcceptEncodingGzip: true,
      },
    )

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Salesforce Account App staging frontend + API proxy',
      defaultRootObject: 'index.html',
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      enableLogging: true,
      logBucket: this.accessLogsBucket as unknown as s3.IBucket,
      logFilePrefix: 'cloudfront-access-logs/',
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: staticAssetCachePolicy,
        responseHeadersPolicy: securityHeadersPolicy,
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Forwards Authorization + query strings + all other viewer
          // headers except Host, so CloudFront sets the origin Host header
          // to the API Gateway execute-api domain rather than forwarding
          // the viewer's CloudFront host. This is the specific,
          // easy-to-get-wrong requirement from the implementation plan;
          // see the CDK assertion test that checks this policy is used.
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: securityHeadersPolicy,
        },
      },
    })

    // Geo restriction is not required for this staging environment; access
    // is already gated by Cognito-issued, scope-checked JWTs at API
    // Gateway (D-11), and the static frontend has no sensitive content.
    Validations.of(this.distribution).acknowledge({
      id: 'AwsSolutions-CFR1',
      reason:
        'Geo restriction is not required for this staging environment; access is already gated by Cognito-issued, scope-checked JWTs at API Gateway (D-11), and the static frontend has no sensitive content of its own.',
    })
    // D-15 (decision log): no custom domain is approved for staging, so
    // this distribution must use the CloudFront default certificate on the
    // generated *.cloudfront.net domain. AWS enforces a fixed TLSv1
    // minimum for that default certificate regardless of
    // `minimumProtocolVersion` (which is still set to TLS_V1_2_2021 above
    // for when/if a custom domain and ACM certificate are approved later).
    Validations.of(this.distribution).acknowledge({
      id: 'AwsSolutions-CFR4',
      reason:
        'D-15: no custom domain is approved for staging, so this distribution uses the CloudFront default certificate on the generated *.cloudfront.net domain; AWS enforces a fixed TLSv1 minimum for that default certificate regardless of minimumProtocolVersion, which is still set to TLS_V1_2_2021 here for when a custom domain/ACM certificate is approved later.',
    })
    // AWS WAF is out of scope for the USD 25/month staging budget alarm
    // (D-19) and is not part of any approved decision-log entry; API
    // Gateway throttling (D-19) and Cognito JWT scope checks are the
    // approved staging controls.
    Validations.of(this.distribution).acknowledge({
      id: 'AwsSolutions-CFR2',
      reason:
        'AWS WAF is out of budget scope for the USD 25/month staging budget alarm (D-19) and is not part of any approved decision-log entry; API Gateway throttling (D-19) and Cognito JWT scope checks are the approved staging controls.',
    })
  }
}
