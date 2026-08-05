import { z } from 'zod'

export const publicErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'PAYLOAD_TOO_LARGE',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'ROUTE_NOT_FOUND',
  'ACCOUNT_NOT_FOUND',
  'PRECONDITION_REQUIRED',
  'PRECONDITION_FAILED',
  'SALESFORCE_REJECTED',
  'INTEGRATION_FORBIDDEN',
  'RATE_LIMITED',
  'INTEGRATION_UNAVAILABLE',
  'INTERNAL_ERROR',
])

export type PublicErrorCode = z.infer<typeof publicErrorCodeSchema>

export interface DataResponse<T> {
  data: T
}

export interface ErrorResponse {
  error: {
    code: PublicErrorCode
    message: string
    requestId: string
  }
}

export const errorResponseSchema = z
  .object({
    error: z
      .object({
        code: publicErrorCodeSchema,
        message: z.string().min(1),
        requestId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/),
      })
      .strict(),
  })
  .strict()
