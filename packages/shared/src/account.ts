import { z } from 'zod'

const SALESFORCE_ID_CHECKSUM_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'
const SALESFORCE_ACCOUNT_ID_PATTERN = /^001[a-zA-Z0-9]{12}(?:[A-Z0-5]{3})?$/

const calculateSalesforceChecksum = (id15: string): string => {
  let checksum = ''

  for (let groupStart = 0; groupStart < 15; groupStart += 5) {
    let flags = 0

    for (let offset = 0; offset < 5; offset += 1) {
      const character = id15[groupStart + offset]
      if (character !== undefined && /[A-Z]/.test(character)) {
        flags += 1 << offset
      }
    }

    checksum += SALESFORCE_ID_CHECKSUM_CHARACTERS[flags]
  }

  return checksum
}

export const isSalesforceAccountId = (value: string): boolean => {
  if (!SALESFORCE_ACCOUNT_ID_PATTERN.test(value)) {
    return false
  }

  if (value.length === 15) {
    return true
  }

  return value.slice(15) === calculateSalesforceChecksum(value.slice(0, 15))
}

export const salesforceAccountIdSchema = z
  .string()
  .refine(isSalesforceAccountId, 'Invalid Salesforce Account ID.')

const requiredTrimmedString = (label: string, maximumLength: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(maximumLength, `${label} must be at most ${maximumLength} characters.`)

const nullableString = (label: string, maximumLength: number) =>
  requiredTrimmedString(label, maximumLength).nullable()

const nullableOptionalString = (label: string, maximumLength: number) =>
  nullableString(label, maximumLength).optional()

const websiteValueSchema = requiredTrimmedString('Website', 255).refine(
  (value) => {
    try {
      const url = new URL(value)
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        url.hostname.length > 0
      )
    } catch {
      return false
    }
  },
  'Website must be a valid HTTP or HTTPS URL.',
)

const optionalAccountFields = {
  accountNumber: nullableOptionalString('Account number', 40),
  type: nullableOptionalString('Type', 40),
  parentId: salesforceAccountIdSchema.nullable().optional(),
  industry: nullableOptionalString('Industry', 40),
  annualRevenue: z
    .number()
    .finite()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable()
    .optional(),
  numberOfEmployees: z
    .number()
    .int()
    .nonnegative()
    .max(2_147_483_647)
    .nullable()
    .optional(),
  ownership: nullableOptionalString('Ownership', 40),
  rating: nullableOptionalString('Rating', 40),
  phone: nullableOptionalString('Phone', 40),
  fax: nullableOptionalString('Fax', 40),
  website: websiteValueSchema.nullable().optional(),
  description: nullableOptionalString('Description', 32_000),
  billingStreet: nullableOptionalString('Billing street', 255),
  billingCity: nullableOptionalString('Billing city', 40),
  billingState: nullableOptionalString('Billing state', 80),
  billingPostalCode: nullableOptionalString('Billing postal code', 20),
  billingCountry: nullableOptionalString('Billing country', 80),
  shippingStreet: nullableOptionalString('Shipping street', 255),
  shippingCity: nullableOptionalString('Shipping city', 40),
  shippingState: nullableOptionalString('Shipping state', 80),
  shippingPostalCode: nullableOptionalString('Shipping postal code', 20),
  shippingCountry: nullableOptionalString('Shipping country', 80),
} as const

export const createAccountInputSchema = z
  .object({
    name: requiredTrimmedString('Name', 255),
    ...optionalAccountFields,
  })
  .strict()

export const updateAccountInputSchema = z
  .object({
    name: requiredTrimmedString('Name', 255).optional(),
    ...optionalAccountFields,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one writable field is required.',
  })

export const accountSchema = z
  .object({
    id: salesforceAccountIdSchema,
    name: requiredTrimmedString('Name', 255),
    accountNumber: nullableString('Account number', 40),
    type: nullableString('Type', 40),
    parentId: salesforceAccountIdSchema.nullable(),
    industry: nullableString('Industry', 40),
    annualRevenue: z
      .number()
      .finite()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    numberOfEmployees: z
      .number()
      .int()
      .nonnegative()
      .max(2_147_483_647)
      .nullable(),
    ownership: nullableString('Ownership', 40),
    rating: nullableString('Rating', 40),
    phone: nullableString('Phone', 40),
    fax: nullableString('Fax', 40),
    website: websiteValueSchema.nullable(),
    description: nullableString('Description', 32_000),
    billingStreet: nullableString('Billing street', 255),
    billingCity: nullableString('Billing city', 40),
    billingState: nullableString('Billing state', 80),
    billingPostalCode: nullableString('Billing postal code', 20),
    billingCountry: nullableString('Billing country', 80),
    shippingStreet: nullableString('Shipping street', 255),
    shippingCity: nullableString('Shipping city', 40),
    shippingState: nullableString('Shipping state', 80),
    shippingPostalCode: nullableString('Shipping postal code', 20),
    shippingCountry: nullableString('Shipping country', 80),
    createdDate: z.string().datetime({ offset: true }),
    lastModifiedDate: z.string().datetime({ offset: true }),
  })
  .strict()

export const accountPageSchema = z
  .object({
    data: z.array(accountSchema).max(50),
    meta: z
      .object({
        pageSize: z.literal(50),
        hasMore: z.boolean(),
        nextCursor: z.string().min(1).max(2_048).nullable(),
      })
      .strict(),
  })
  .strict()

export const createAccountResponseSchema = z
  .object({
    data: z
      .object({
        id: salesforceAccountIdSchema,
        name: requiredTrimmedString('Name', 255),
      })
      .strict(),
  })
  .strict()

export const updateAccountResponseSchema = z
  .object({
    data: z
      .object({
        id: salesforceAccountIdSchema,
        updated: z.literal(true),
      })
      .strict(),
  })
  .strict()

export type Account = z.infer<typeof accountSchema>
export type AccountPage = z.infer<typeof accountPageSchema>
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>
export type CreateAccountResponse = z.infer<typeof createAccountResponseSchema>
export type UpdateAccountResponse = z.infer<typeof updateAccountResponseSchema>
