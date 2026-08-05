import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { beforeAll, describe, expect, it } from 'vitest'

import { StagingFoundationStack } from '../lib/staging-foundation-stack.js'

describe('StagingFoundationStack', () => {
  let template: Template
  let stack: StagingFoundationStack

  beforeAll(() => {
    const app = new App()
    stack = new StagingFoundationStack(app, 'TestStack', {
      env: { region: 'ap-southeast-1' },
    })
    template = Template.fromStack(stack)
  })

  it('targets Singapore and contains no application-level persistence', () => {
    expect(stack.region).toBe('ap-southeast-1')
    template.resourceCountIs('AWS::DynamoDB::Table', 0)
    template.resourceCountIs('AWS::RDS::DBInstance', 0)
  })

  describe('Cognito (D-09, D-11)', () => {
    it('disables self-sign-up and MFA for the admin-created staging user pool', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
        MfaConfiguration: 'OFF',
      })
    })

    it('exposes the accounts-api/access scope from a resource server', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolResourceServer', {
        Identifier: 'accounts-api',
        Scopes: Match.arrayWith([Match.objectLike({ ScopeName: 'access' })]),
      })
    })

    it('creates a secretless SPA client using only the authorization-code grant', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        GenerateSecret: false,
        AllowedOAuthFlows: ['code'],
        AllowedOAuthFlowsUserPoolClient: true,
      })

      // The accounts-api/access scope is an unresolved Fn::Join token at
      // synth time (built from the resource server identifier + scope
      // name), so it is asserted structurally rather than as a literal
      // string.
      const clients = template.findResources('AWS::Cognito::UserPoolClient')
      const [client] = Object.values(clients)
      const scopes = client?.Properties.AllowedOAuthScopes as unknown[]
      expect(scopes).toHaveLength(3)
      expect(scopes).toContain('openid')
      expect(scopes).toContain('email')
    })

    it('retains the user pool rather than destroying it', () => {
      template.hasResource('AWS::Cognito::UserPool', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      })
    })
  })

  describe('API Gateway JWT authorization (D-11)', () => {
    it('requires the accounts-api/access scope on every route except /api/health', () => {
      const routes = template.findResources('AWS::ApiGatewayV2::Route')
      const routeEntries = Object.values(routes)

      expect(routeEntries.length).toBeGreaterThan(0)

      const healthRoutes = routeEntries.filter(
        (route) => route.Properties.RouteKey === 'GET /api/health',
      )
      const otherRoutes = routeEntries.filter(
        (route) => route.Properties.RouteKey !== 'GET /api/health',
      )

      expect(healthRoutes).toHaveLength(1)
      expect(otherRoutes.length).toBeGreaterThan(0)

      for (const route of healthRoutes) {
        expect(route.Properties.AuthorizationType).toBe('NONE')
      }

      for (const route of otherRoutes) {
        expect(route.Properties.AuthorizationType).toBe('JWT')
        expect(route.Properties.AuthorizationScopes).toEqual([
          'accounts-api/access',
        ])
      }
    })

    it('configures a JWT authorizer bound to the Cognito user pool issuer', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
        AuthorizerType: 'JWT',
        IdentitySource: ['$request.header.Authorization'],
      })
    })
  })

  describe('Throttling (D-19)', () => {
    it('applies the aggregate 2 rps / burst 5 throttle to the default stage', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        DefaultRouteSettings: Match.objectLike({
          ThrottlingRateLimit: 2,
          ThrottlingBurstLimit: 5,
        }),
      })
    })

    it('overrides the write routes with a 1 rps / burst 2 throttle', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        RouteSettings: {
          'POST /api/accounts': {
            throttlingRateLimit: 1,
            throttlingBurstLimit: 2,
          },
          'PATCH /api/accounts/{id}': {
            throttlingRateLimit: 1,
            throttlingBurstLimit: 2,
          },
          'DELETE /api/accounts/{id}': {
            throttlingRateLimit: 1,
            throttlingBurstLimit: 2,
          },
        },
      })
    })
  })

  describe('Lambda (D-19)', () => {
    it('sets a 15 second timeout and reserved concurrency of 5', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Timeout: 15,
        ReservedConcurrentExecutions: 5,
      })
    })

    it('grants IAM read access to exactly one Secrets Manager resource', () => {
      const policies = template.findResources('AWS::IAM::Policy')
      const statements = Object.values(policies).flatMap(
        (policy) =>
          policy.Properties.PolicyDocument.Statement as Array<{
            Action: string | string[]
          }>,
      )
      const secretsStatements = statements.filter((statement) => {
        const actions = Array.isArray(statement.Action)
          ? statement.Action
          : [statement.Action]
        return actions.some(
          (action) =>
            typeof action === 'string' && action.startsWith('secretsmanager:'),
        )
      })

      expect(secretsStatements).toHaveLength(1)
    })
  })

  describe('Private S3 + CloudFront OAC (D-15)', () => {
    it('blocks all public access on every bucket', () => {
      const buckets = template.findResources('AWS::S3::Bucket')
      for (const bucket of Object.values(buckets)) {
        expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        })
      }
    })

    it('never configures S3 website hosting', () => {
      const buckets = template.findResources('AWS::S3::Bucket')
      for (const bucket of Object.values(buckets)) {
        expect(bucket.Properties.WebsiteConfiguration).toBeUndefined()
      }
    })

    it('serves the frontend bucket only through an Origin Access Control', () => {
      template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1)
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          Origins: Match.arrayWith([
            Match.objectLike({
              OriginAccessControlId: Match.anyValue(),
              S3OriginConfig: { OriginAccessIdentity: '' },
            }),
          ]),
        }),
      })
    })

    it('retains the site and access-log buckets rather than destroying them', () => {
      const buckets = template.findResources('AWS::S3::Bucket')
      for (const [, bucket] of Object.entries(buckets)) {
        expect(bucket.DeletionPolicy).toBe('Retain')
        expect(bucket.UpdateReplacePolicy).toBe('Retain')
      }
    })
  })

  describe('CloudFront /api/* origin Host header override (plan section 6)', () => {
    it('targets the API Gateway execute-api host, not the CloudFront domain', () => {
      const httpApis = template.findResources('AWS::ApiGatewayV2::Api')
      const [httpApiLogicalId] = Object.keys(httpApis)

      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          Origins: Match.arrayWith([
            Match.objectLike({
              DomainName: {
                'Fn::Join': [
                  '',
                  [
                    { Ref: httpApiLogicalId },
                    '.execute-api.ap-southeast-1.amazonaws.com',
                  ],
                ],
              },
              CustomOriginConfig: Match.objectLike({
                OriginProtocolPolicy: 'https-only',
              }),
            }),
          ]),
        }),
      })
    })

    it('disables caching and forwards viewer headers except Host on the /api/* behavior', () => {
      // CachePolicyId 4135ea2d-6df8-44a3-9df3-4b5a84be39ad is the AWS
      // managed CACHING_DISABLED policy; OriginRequestPolicyId
      // b689b0a8-53d0-40ab-baf2-68738e2966ac is the AWS managed
      // ALL_VIEWER_EXCEPT_HOST_HEADER policy, which forwards Authorization
      // and query strings but always lets CloudFront set Host to the
      // origin's own domain (the API Gateway host) rather than the
      // viewer's CloudFront host.
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          CacheBehaviors: Match.arrayWith([
            Match.objectLike({
              PathPattern: '/api/*',
              CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
              OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac',
              AllowedMethods: Match.arrayWith(['PATCH', 'POST', 'DELETE']),
            }),
          ]),
        }),
      })
    })
  })

  describe('Retention (D-14)', () => {
    it('sets 30-day retention on every CloudWatch log group', () => {
      const logGroups = template.findResources('AWS::Logs::LogGroup')
      expect(Object.keys(logGroups).length).toBeGreaterThan(0)
      for (const logGroup of Object.values(logGroups)) {
        expect(logGroup.Properties.RetentionInDays).toBe(30)
      }
    })

    it('retains every CloudWatch log group instead of destroying it', () => {
      const logGroups = template.findResources('AWS::Logs::LogGroup')
      for (const [, logGroup] of Object.entries(logGroups)) {
        expect(logGroup.DeletionPolicy).toBe('Retain')
        expect(logGroup.UpdateReplacePolicy).toBe('Retain')
      }
    })
  })

  describe('Budget alarm (D-18, D-19)', () => {
    it('creates a USD 25/month budget notifying the approved recipient', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        Budget: Match.objectLike({
          BudgetLimit: { Amount: 25, Unit: 'USD' },
        }),
        NotificationsWithSubscribers: Match.arrayWith([
          Match.objectLike({
            Subscribers: Match.arrayWith([
              Match.objectLike({
                SubscriptionType: 'EMAIL',
                Address: 'diom.sea@gmail.com',
              }),
            ]),
          }),
        ]),
      })
    })
  })
})
