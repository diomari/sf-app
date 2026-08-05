#!/usr/bin/env node
import { App, Validations } from 'aws-cdk-lib'
import { AwsSolutionsChecks } from 'cdk-nag'

import { StagingFoundationStack } from '../lib/staging-foundation-stack.js'

const app = new App()

Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }))

new StagingFoundationStack(app, 'SalesforceAccountApp-Staging', {
  description: 'Salesforce Account App staging foundation',
  env: {
    region: 'ap-southeast-1',
  },
})

app.synth()
