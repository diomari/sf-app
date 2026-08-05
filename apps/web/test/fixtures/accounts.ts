import type { Account } from '@salesforce-account-app/shared'

/** Disposable, obviously-fake fixture data — never real Salesforce records. */
export const buildFakeAccount = (
  overrides: Partial<Account> = {},
): Account => ({
  id: '001000000000001AAA',
  name: 'Fixture Company',
  accountNumber: 'FX-1001',
  type: 'Customer - Direct',
  parentId: null,
  industry: 'Technology',
  annualRevenue: 1_000_000,
  numberOfEmployees: 25,
  ownership: 'Private',
  rating: 'Hot',
  phone: '+63 912 345 6789',
  fax: null,
  website: 'https://example.test',
  description: 'Fixture Account for tests',
  billingStreet: '123 Fixture Street',
  billingCity: 'Makati',
  billingState: 'Metro Manila',
  billingPostalCode: '1200',
  billingCountry: 'Philippines',
  shippingStreet: null,
  shippingCity: null,
  shippingState: null,
  shippingPostalCode: null,
  shippingCountry: null,
  createdDate: '2026-08-01T10:00:00.000Z',
  lastModifiedDate: '2026-08-05T10:00:00.000Z',
  ...overrides,
})

export const buildFakeAccounts = (count: number): Account[] =>
  Array.from({ length: count }, (_, index) =>
    buildFakeAccount({
      // 15-character canonical Salesforce ID (no checksum suffix needed).
      id: `001${String(index + 1).padStart(12, '0')}`,
      name: `Fixture Company ${index + 1}`,
      accountNumber: `FX-${1000 + index}`,
    }),
  )
