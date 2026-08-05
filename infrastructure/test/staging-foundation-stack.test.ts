import { App } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'

import { StagingFoundationStack } from '../lib/staging-foundation-stack.js'

describe('StagingFoundationStack', () => {
  it('targets Singapore and contains no persistence or application resources', () => {
    const app = new App()
    const stack = new StagingFoundationStack(app, 'TestStack', {
      env: { region: 'ap-southeast-1' },
    })
    const template = Template.fromStack(stack)

    expect(stack.region).toBe('ap-southeast-1')
    template.resourceCountIs('AWS::DynamoDB::Table', 0)
    template.resourceCountIs('AWS::RDS::DBInstance', 0)
    expect(template.toJSON()).toEqual({
      Parameters: expect.any(Object),
      Rules: expect.any(Object),
    })
  })
})
