import type { PublicErrorCode } from '@salesforce-account-app/shared'

export interface OperationalLogEvent {
  requestId: string
  route: string
  method: string
  durationMs?: number
  outcome: 'success' | 'client_error' | 'server_error'
  status: number
  errorCode?: PublicErrorCode
}

export interface Logger {
  info(event: OperationalLogEvent): void
  error(event: OperationalLogEvent): void
}

export interface ConsoleLoggerDependencies {
  now?: () => Date
  writeInfo?: (line: string) => void
  writeError?: (line: string) => void
}

export const createConsoleLogger = (
  dependencies: ConsoleLoggerDependencies = {},
): Logger => {
  const now = dependencies.now ?? (() => new Date())
  const writeInfo = dependencies.writeInfo ?? console.log
  const writeError = dependencies.writeError ?? console.error

  const serialize = (
    level: 'info' | 'error',
    event: OperationalLogEvent,
  ): string =>
    JSON.stringify({
      timestamp: now().toISOString(),
      level,
      requestId: event.requestId,
      route: event.route,
      method: event.method,
      ...(event.durationMs === undefined
        ? {}
        : { durationMs: event.durationMs }),
      outcome: event.outcome,
      status: event.status,
      ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
    })

  return {
    info: (event) => writeInfo(serialize('info', event)),
    error: (event) => writeError(serialize('error', event)),
  }
}
