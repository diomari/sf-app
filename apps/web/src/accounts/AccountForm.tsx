import {
  createAccountInputSchema,
  updateAccountInputSchema,
  type Account,
  type CreateAccountInput,
  type UpdateAccountInput,
} from '@salesforce-account-app/shared'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { ACCOUNT_FIELDS } from './fields.js'

const NUMBER_FIELD_KEYS = new Set(['annualRevenue', 'numberOfEmployees'])

const toFieldString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

const buildInitialValues = (
  account: Account | null,
): Record<string, string> => {
  const values: Record<string, string> = {}
  for (const field of ACCOUNT_FIELDS) {
    values[field.key] = account
      ? toFieldString(
          (account as unknown as Record<string, unknown>)[field.key],
        )
      : ''
  }
  return values
}

type FormMode = 'create' | 'edit'

interface AccountFormProps {
  mode: FormMode
  account?: Account
  submitting: boolean
  serverError?: string | null
  onCancel: () => void
  onSubmitCreate?: (input: CreateAccountInput) => void
  onSubmitUpdate?: (input: UpdateAccountInput) => void
}

/**
 * Shared create/edit form driven by the shared zod schemas.
 *
 * PATCH semantics (edit mode): a field left exactly as loaded is omitted
 * from the payload; a nullable field the user empties out is sent as an
 * explicit `null` so it clears in Salesforce; a field with a new value is
 * sent as that value.
 */
export const AccountForm = ({
  mode,
  account,
  submitting,
  serverError,
  onCancel,
  onSubmitCreate,
  onSubmitUpdate,
}: AccountFormProps) => {
  const initialAccount = account ?? null
  const initialValues = useMemo(
    () => buildInitialValues(initialAccount),
    [initialAccount],
  )
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const setValue = (key: string, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  const parseFieldValue = (key: string, raw: string): unknown => {
    if (NUMBER_FIELD_KEYS.has(key)) {
      return Number(raw)
    }
    return raw
  }

  const buildPayload = (): CreateAccountInput | UpdateAccountInput | null => {
    const draft: Record<string, unknown> = {}

    for (const field of ACCOUNT_FIELDS) {
      const raw = values[field.key] ?? ''
      const trimmed = raw.trim()

      if (mode === 'create') {
        if (field.required) {
          draft[field.key] = trimmed
        } else if (trimmed !== '') {
          draft[field.key] = parseFieldValue(field.key, trimmed)
        }
        continue
      }

      // Edit mode: compare against the value the record loaded with, and
      // omit the field entirely from the PATCH payload when unchanged.
      const initial = initialValues[field.key] ?? ''
      if (raw === initial) {
        continue // unchanged: omit from PATCH
      }
      if (field.required) {
        // `name` cannot be cleared; let schema validation reject a blank value.
        draft[field.key] = trimmed
        continue
      }
      if (trimmed === '') {
        draft[field.key] = null // explicit clear
        continue
      }
      draft[field.key] = parseFieldValue(field.key, trimmed)
    }

    const schema =
      mode === 'create' ? createAccountInputSchema : updateAccountInputSchema
    const result = schema.safeParse(draft)

    if (!result.success) {
      const nextErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && !(key in nextErrors)) {
          nextErrors[key] = issue.message
        }
      }
      setFieldErrors(nextErrors)
      return null
    }

    setFieldErrors({})
    return result.data
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload = buildPayload()
    if (payload === null) {
      return
    }
    if (mode === 'create') {
      onSubmitCreate?.(payload as CreateAccountInput)
    } else {
      onSubmitUpdate?.(payload as UpdateAccountInput)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {serverError !== null && serverError !== undefined && (
        <p role="alert" className="form-error">
          {serverError}
        </p>
      )}
      <div className="form-grid">
        {ACCOUNT_FIELDS.map((field) => {
          const inputId = `account-field-${field.key}`
          const errorId = `${inputId}-error`
          const error = fieldErrors[field.key]

          return (
            <div className="form-field" key={field.key}>
              <label htmlFor={inputId}>
                {field.label}
                {field.required ? ' (required)' : ''}
              </label>
              {field.kind === 'textarea' ? (
                <textarea
                  id={inputId}
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValue(field.key, event.target.value)}
                  aria-invalid={error !== undefined}
                  aria-describedby={error !== undefined ? errorId : undefined}
                />
              ) : (
                <input
                  id={inputId}
                  type={field.kind === 'number' ? 'number' : 'text'}
                  inputMode={field.kind === 'number' ? 'decimal' : undefined}
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValue(field.key, event.target.value)}
                  aria-invalid={error !== undefined}
                  aria-describedby={error !== undefined ? errorId : undefined}
                  required={field.required === true}
                />
              )}
              {error !== undefined && (
                <p id={errorId} role="alert" className="field-error">
                  {error}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <div className="form-actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" disabled={submitting}>
          {submitting
            ? 'Saving…'
            : mode === 'create'
              ? 'Create account'
              : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
