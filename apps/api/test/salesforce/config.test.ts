import { describe, expect, it } from 'vitest'

import { AppError } from '../../src/errors/app-error.js'
import { readSalesforceEnvironmentConfig } from '../../src/salesforce/config.js'

describe('readSalesforceEnvironmentConfig', () => {
  it('returns the configured secret ARN', () => {
    const config = readSalesforceEnvironmentConfig({
      SALESFORCE_SECRET_ARN: 'arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:sf-integration',
    })

    expect(config).toEqual({
      secretArn:
        'arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:sf-integration',
    })
  })

  it('throws a typed error when the ARN is missing', () => {
    expect(() => readSalesforceEnvironmentConfig({})).toThrow(AppError)
  })

  it('throws a typed error when the ARN is blank', () => {
    expect(() =>
      readSalesforceEnvironmentConfig({ SALESFORCE_SECRET_ARN: '   ' }),
    ).toThrow(AppError)
  })
})
