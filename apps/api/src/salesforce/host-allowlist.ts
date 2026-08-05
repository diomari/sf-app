import { AppError } from '../errors/app-error.js'

const ALLOWED_HOST_SUFFIXES = ['.my.salesforce.com'] as const

const ALLOWED_EXACT_HOSTS = ['test.salesforce.com'] as const

export const isAllowedSalesforceHost = (hostname: string): boolean => {
  const lowerHostname = hostname.toLowerCase()

  if (
    ALLOWED_EXACT_HOSTS.includes(
      lowerHostname as (typeof ALLOWED_EXACT_HOSTS)[number],
    )
  ) {
    return true
  }

  return ALLOWED_HOST_SUFFIXES.some((suffix) => lowerHostname.endsWith(suffix))
}

const throwHostRejected = (): never => {
  throw new AppError(
    502,
    'INTEGRATION_UNAVAILABLE',
    'Salesforce integration configuration is invalid.',
  )
}

export const assertAllowedSalesforceHost = (candidateUrl: string): URL => {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(candidateUrl)
  } catch {
    return throwHostRejected()
  }

  if (parsedUrl.protocol !== 'https:') {
    return throwHostRejected()
  }

  if (!isAllowedSalesforceHost(parsedUrl.hostname)) {
    return throwHostRejected()
  }

  return parsedUrl
}
