import { AppError } from '../errors/app-error.js'
import { SALESFORCE_REQUEST_TIMEOUT_MS } from './config.js'

export type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<Response>

export type BoundedFetch = (
  input: string,
  init: RequestInit,
  externalSignal?: AbortSignal,
) => Promise<Response>

export interface BoundedFetchDependencies {
  fetch?: FetchLike
  timeoutMs?: number
}

export const createBoundedFetch = (
  dependencies: BoundedFetchDependencies = {},
): BoundedFetch => {
  const fetchImpl = dependencies.fetch ?? fetch
  const timeoutMs = dependencies.timeoutMs ?? SALESFORCE_REQUEST_TIMEOUT_MS

  return async (input, init, externalSignal) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal =
      externalSignal === undefined
        ? timeoutSignal
        : AbortSignal.any([timeoutSignal, externalSignal])

    try {
      return await fetchImpl(input, { ...init, signal })
    } catch (error) {
      if (timeoutSignal.aborted) {
        throw new AppError(
          504,
          'INTEGRATION_UNAVAILABLE',
          'The Salesforce request timed out.',
        )
      }

      if (externalSignal?.aborted === true) {
        throw error
      }

      throw new AppError(
        502,
        'INTEGRATION_UNAVAILABLE',
        'Unable to reach Salesforce.',
      )
    }
  }
}
