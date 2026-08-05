import type { Context } from 'hono'
import type { output, ZodType } from 'zod'

import { AppError } from '../errors/app-error.js'
import type { AppEnvironment } from './environment.js'

export const MAX_REQUEST_BODY_BYTES = 64 * 1024

const throwValidationError = (): never => {
  throw new AppError(400, 'VALIDATION_ERROR', 'Request body is invalid.')
}

export const parseJsonBody = async <Schema extends ZodType>(
  context: Context<AppEnvironment>,
  schema: Schema,
): Promise<output<Schema>> => {
  const contentType = context.req.header('content-type')
  if (
    contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    return throwValidationError()
  }

  const contentLength = context.req.header('content-length')
  if (contentLength !== undefined) {
    if (!/^\d+$/.test(contentLength)) {
      return throwValidationError()
    }

    if (Number(contentLength) > MAX_REQUEST_BODY_BYTES) {
      throw new AppError(
        413,
        'PAYLOAD_TOO_LARGE',
        'Request body exceeds the 64 KiB limit.',
      )
    }
  }

  const bytes = await context.req.raw.arrayBuffer()
  if (bytes.byteLength > MAX_REQUEST_BODY_BYTES) {
    throw new AppError(
      413,
      'PAYLOAD_TOO_LARGE',
      'Request body exceeds the 64 KiB limit.',
    )
  }

  let input: unknown
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    input = JSON.parse(text) as unknown
  } catch {
    return throwValidationError()
  }

  const result = schema.safeParse(input)
  if (!result.success) {
    return throwValidationError()
  }

  return result.data
}
