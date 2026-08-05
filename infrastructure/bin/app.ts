#!/usr/bin/env node
import { App, Validations } from 'aws-cdk-lib'
import { AwsSolutionsChecks } from 'cdk-nag'

import { StagingFoundationStack } from '../lib/staging-foundation-stack.js'

const app = new App()

Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }))

// Context-driven values only; no secret material is ever accepted here.
// Defaults mirror .env.example's VITE_COGNITO_REDIRECT_URI/VITE_COGNITO_LOGOUT_URI
// and are overridable with `-c <key>=<value>` (repeat for array values) once
// real staging values (e.g. the deployed CloudFront domain, per D-15) exist.
const cognitoCallbackUrls = app.node.tryGetContext('cognitoCallbackUrls') as
  string[] | undefined
const cognitoLogoutUrls = app.node.tryGetContext('cognitoLogoutUrls') as
  string[] | undefined
const cognitoDomainPrefix = app.node.tryGetContext('cognitoDomainPrefix') as
  string | undefined
// Placeholder only; the real ARN is coordinated with the Milestone 3 owner
// once the Secrets Manager secret exists, per AGENTS.md approval boundaries.
const salesforceSecretArn = app.node.tryGetContext('salesforceSecretArn') as
  string | undefined
const salesforceApiVersion = app.node.tryGetContext('salesforceApiVersion') as
  string | undefined
const allowedOrigin = app.node.tryGetContext('allowedOrigin') as
  string | undefined

new StagingFoundationStack(app, 'SalesforceAccountApp-Staging', {
  description: 'Salesforce Account App staging foundation',
  env: {
    region: 'ap-southeast-1',
  },
  ...(cognitoCallbackUrls === undefined ? {} : { cognitoCallbackUrls }),
  ...(cognitoLogoutUrls === undefined ? {} : { cognitoLogoutUrls }),
  ...(cognitoDomainPrefix === undefined ? {} : { cognitoDomainPrefix }),
  ...(salesforceSecretArn === undefined ? {} : { salesforceSecretArn }),
  ...(salesforceApiVersion === undefined ? {} : { salesforceApiVersion }),
  ...(allowedOrigin === undefined ? {} : { allowedOrigin }),
})

app.synth()
