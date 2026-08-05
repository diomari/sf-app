export type FieldKind = 'text' | 'textarea' | 'number' | 'url'

export interface FieldDef {
  key: string
  label: string
  kind: FieldKind
  required?: boolean
}

/** Writable Account fields per `createAccountInputSchema`/`updateAccountInputSchema`.
 * `parentId` is intentionally omitted: D-04 retains it in the API contract
 * but defers the parent-picker UI to a later milestone.
 */
export const ACCOUNT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'accountNumber', label: 'Account number', kind: 'text' },
  { key: 'type', label: 'Type', kind: 'text' },
  { key: 'industry', label: 'Industry', kind: 'text' },
  { key: 'annualRevenue', label: 'Annual revenue', kind: 'number' },
  { key: 'numberOfEmployees', label: 'Number of employees', kind: 'number' },
  { key: 'ownership', label: 'Ownership', kind: 'text' },
  { key: 'rating', label: 'Rating', kind: 'text' },
  { key: 'phone', label: 'Phone', kind: 'text' },
  { key: 'fax', label: 'Fax', kind: 'text' },
  { key: 'website', label: 'Website', kind: 'url' },
  { key: 'description', label: 'Description', kind: 'textarea' },
  { key: 'billingStreet', label: 'Billing street', kind: 'text' },
  { key: 'billingCity', label: 'Billing city', kind: 'text' },
  { key: 'billingState', label: 'Billing state', kind: 'text' },
  { key: 'billingPostalCode', label: 'Billing postal code', kind: 'text' },
  { key: 'billingCountry', label: 'Billing country', kind: 'text' },
  { key: 'shippingStreet', label: 'Shipping street', kind: 'text' },
  { key: 'shippingCity', label: 'Shipping city', kind: 'text' },
  { key: 'shippingState', label: 'Shipping state', kind: 'text' },
  { key: 'shippingPostalCode', label: 'Shipping postal code', kind: 'text' },
  { key: 'shippingCountry', label: 'Shipping country', kind: 'text' },
]

export const NULLABLE_FIELD_KEYS = new Set(
  ACCOUNT_FIELDS.filter((field) => !field.required).map((field) => field.key),
)
