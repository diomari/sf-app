import { describe, expect, it } from 'vitest'

import {
  accountSchema,
  createAccountInputSchema,
  isSalesforceAccountId,
  updateAccountInputSchema,
} from '../src/index.js'

const validAccountId = '001000000000001AAA'

const nullableAccountFields = {
  accountNumber: null,
  type: null,
  parentId: null,
  industry: null,
  annualRevenue: null,
  numberOfEmployees: null,
  ownership: null,
  rating: null,
  phone: null,
  fax: null,
  website: null,
  description: null,
  billingStreet: null,
  billingCity: null,
  billingState: null,
  billingPostalCode: null,
  billingCountry: null,
  shippingStreet: null,
  shippingCity: null,
  shippingState: null,
  shippingPostalCode: null,
  shippingCountry: null,
}

describe('Salesforce Account ID validation', () => {
  it('accepts canonical 15- and 18-character Account IDs', () => {
    expect(isSalesforceAccountId('001000000000001')).toBe(true)
    expect(isSalesforceAccountId(validAccountId)).toBe(true)
  })

  it('rejects a non-Account prefix and a bad 18-character checksum', () => {
    expect(isSalesforceAccountId('003000000000001AAA')).toBe(false)
    expect(isSalesforceAccountId('001000000000001AAB')).toBe(false)
  })
})

describe('createAccountInputSchema', () => {
  it('accepts and normalizes the explicit writable contract', () => {
    const result = createAccountInputSchema.parse({
      name: '  Example Company  ',
      accountNumber: ' AC-1001 ',
      parentId: validAccountId,
      annualRevenue: 1_000_000,
      numberOfEmployees: 25,
      website: 'https://example.com/account',
      billingCountry: null,
    })

    expect(result).toEqual({
      name: 'Example Company',
      accountNumber: 'AC-1001',
      parentId: validAccountId,
      annualRevenue: 1_000_000,
      numberOfEmployees: 25,
      website: 'https://example.com/account',
      billingCountry: null,
    })
  })

  it('rejects missing, blank, and overlong names', () => {
    expect(createAccountInputSchema.safeParse({}).success).toBe(false)
    expect(createAccountInputSchema.safeParse({ name: '   ' }).success).toBe(
      false,
    )
    expect(
      createAccountInputSchema.safeParse({ name: 'x'.repeat(256) }).success,
    ).toBe(false)
  })

  it('rejects unknown and read-only fields', () => {
    expect(
      createAccountInputSchema.safeParse({
        name: 'Example',
        id: validAccountId,
      }).success,
    ).toBe(false)
    expect(
      createAccountInputSchema.safeParse({
        name: 'Example',
        customField: 'not allowlisted',
      }).success,
    ).toBe(false)
  })

  it('allows only HTTP and HTTPS website URLs', () => {
    expect(
      createAccountInputSchema.safeParse({
        name: 'Example',
        website: 'http://example.com',
      }).success,
    ).toBe(true)
    expect(
      createAccountInputSchema.safeParse({
        name: 'Example',
        website: 'javascript:alert(1)',
      }).success,
    ).toBe(false)
    expect(
      createAccountInputSchema.safeParse({
        name: 'Example',
        website: 'ftp://example.com',
      }).success,
    ).toBe(false)
  })

  it('rejects invalid numeric and Account ID values', () => {
    expect(
      createAccountInputSchema.safeParse({
        name: 'Example',
        numberOfEmployees: 2.5,
      }).success,
    ).toBe(false)
    expect(
      createAccountInputSchema.safeParse({
        name: 'Example',
        annualRevenue: -1,
      }).success,
    ).toBe(false)
    expect(
      createAccountInputSchema.safeParse({
        name: 'Example',
        parentId: '001-invalid',
      }).success,
    ).toBe(false)
  })
})

describe('updateAccountInputSchema', () => {
  it('accepts explicit null to clear a nullable field', () => {
    expect(updateAccountInputSchema.parse({ website: null })).toEqual({
      website: null,
    })
  })

  it('accepts an omitted name but rejects null or blank when supplied', () => {
    expect(
      updateAccountInputSchema.safeParse({ phone: '+65 5555 0100' }).success,
    ).toBe(true)
    expect(updateAccountInputSchema.safeParse({ name: null }).success).toBe(
      false,
    )
    expect(updateAccountInputSchema.safeParse({ name: ' ' }).success).toBe(
      false,
    )
  })

  it('rejects an empty patch and unknown or read-only fields', () => {
    expect(updateAccountInputSchema.safeParse({}).success).toBe(false)
    expect(
      updateAccountInputSchema.safeParse({ lastModifiedDate: '2026-08-05' })
        .success,
    ).toBe(false)
    expect(
      updateAccountInputSchema.safeParse({ arbitrary: 'value' }).success,
    ).toBe(false)
  })
})

describe('accountSchema', () => {
  it('accepts an explicit read DTO and rejects Salesforce metadata', () => {
    const account = {
      id: validAccountId,
      name: 'Example Company',
      ...nullableAccountFields,
      createdDate: '2026-08-05T10:00:00.000Z',
      lastModifiedDate: '2026-08-05T10:00:00.000Z',
    }

    expect(accountSchema.parse(account)).toEqual(account)
    expect(
      accountSchema.safeParse({ ...account, attributes: { type: 'Account' } })
        .success,
    ).toBe(false)
    expect(
      accountSchema.safeParse({ ...account, website: 'javascript:alert(1)' })
        .success,
    ).toBe(false)
  })
})
