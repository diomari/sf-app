import { describe, expect, it } from 'vitest'

import { AppError } from '../../src/errors/app-error.js'
import {
  assertAllowedSalesforceHost,
  isAllowedSalesforceHost,
} from '../../src/salesforce/host-allowlist.js'

describe('isAllowedSalesforceHost', () => {
  it('allows an approved My Domain sandbox host', () => {
    expect(isAllowedSalesforceHost('example--sandbox.my.salesforce.com')).toBe(
      true,
    )
  })

  it('allows the sandbox login host', () => {
    expect(isAllowedSalesforceHost('test.salesforce.com')).toBe(true)
  })

  it('rejects an unrelated host', () => {
    expect(isAllowedSalesforceHost('evil.example.com')).toBe(false)
  })

  it('rejects a host that merely contains the approved suffix as a prefix trick', () => {
    expect(isAllowedSalesforceHost('my.salesforce.com.evil.example.com')).toBe(
      false,
    )
  })
})

describe('assertAllowedSalesforceHost', () => {
  it('returns the parsed URL for an approved HTTPS host', () => {
    const url = assertAllowedSalesforceHost(
      'https://example--sandbox.my.salesforce.com',
    )

    expect(url.hostname).toBe('example--sandbox.my.salesforce.com')
  })

  it('rejects an http (non-TLS) URL even on an approved host', () => {
    expect(() =>
      assertAllowedSalesforceHost('http://example.my.salesforce.com'),
    ).toThrow(AppError)
  })

  it('rejects a disallowed host', () => {
    expect(() =>
      assertAllowedSalesforceHost('https://attacker.example.com'),
    ).toThrow(AppError)
  })

  it('rejects a malformed URL', () => {
    expect(() => assertAllowedSalesforceHost('not-a-url')).toThrow(AppError)
  })

  it('never exposes the raw rejected value in the error message', () => {
    try {
      assertAllowedSalesforceHost('https://attacker.example.com/secret-path')
      throw new Error('expected assertAllowedSalesforceHost to throw')
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(
        'attacker.example.com',
      )
    }
  })
})
