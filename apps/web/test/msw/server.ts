import { setupServer } from 'msw/node'

import { createAccountsHandlers, type MockAccountsState } from './handlers.js'

export const mockState: MockAccountsState = { accounts: [] }

export const resetMockState = (
  accounts: MockAccountsState['accounts'] = [],
) => {
  mockState.accounts = accounts
}

export const server = setupServer(...createAccountsHandlers(mockState))
