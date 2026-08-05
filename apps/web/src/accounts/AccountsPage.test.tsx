import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  buildFakeAccount,
  buildFakeAccounts,
} from '../../test/fixtures/accounts.js'
import { mockState, server } from '../../test/msw/server.js'
import { ApiClient } from '../api/client.js'
import { AccountsPage } from './AccountsPage.js'

const renderPage = () => {
  const apiClient = new ApiClient({
    baseUrl: 'https://api.example.test/api',
    getAccessToken: () => 'fake-access-token',
  })
  return render(<AccountsPage apiClient={apiClient} />)
}

describe('AccountsPage', () => {
  beforeEach(() => {
    mockState.accounts = [buildFakeAccount()]
  })

  it('shows a loading state then the account list', async () => {
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Loading accounts')
    await waitFor(() =>
      expect(screen.getByText('Fixture Company')).toBeInTheDocument(),
    )
  })

  it('shows an empty state when there are no accounts', async () => {
    mockState.accounts = []
    renderPage()

    await waitFor(() =>
      expect(screen.getByText(/No accounts yet/)).toBeInTheDocument(),
    )
  })

  it('debounces search and filters by name/account number only', async () => {
    mockState.accounts = [
      buildFakeAccount({
        id: '001000000000001',
        name: 'Acme Corp',
        accountNumber: 'AC-1',
      }),
      buildFakeAccount({
        id: '001000000000002',
        name: 'Globex',
        accountNumber: 'GX-2',
      }),
    ]
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByText('Globex')).toBeInTheDocument())

    const search = screen.getByLabelText('Search accounts')
    await user.type(search, 'Acme')

    await waitFor(
      () => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument()
        expect(screen.queryByText('Globex')).not.toBeInTheDocument()
      },
      { timeout: 2000 },
    )
  })

  it('paginates in pages of 50 using the opaque cursor', async () => {
    mockState.accounts = buildFakeAccounts(75)
    renderPage()

    await waitFor(
      () => expect(screen.getAllByRole('row')).toHaveLength(51), // 50 + header row
    )

    const loadMore = screen.getByRole('button', { name: 'Load more' })
    const user = userEvent.setup()
    await user.click(loadMore)

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(76))
    expect(
      screen.queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument()
  })

  it('creates an account and shows a success message', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Fixture Company')).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'New account' }))
    await user.type(screen.getByLabelText('Name (required)'), 'Brand New Co')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() =>
      expect(
        screen.getByText('Created account "Brand New Co".'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Brand New Co')).toBeInTheDocument()
  })

  it('updates an account and clears a nullable field to null', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Fixture Company')).toBeInTheDocument(),
    )

    let capturedBody: Record<string, unknown> | null = null
    server.use(
      http.patch('*/api/accounts/:id', async ({ request, params }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        mockState.accounts = mockState.accounts.map((account) =>
          account.id === params.id
            ? {
                ...account,
                ...capturedBody,
                lastModifiedDate: new Date().toISOString(),
              }
            : account,
        )
        return HttpResponse.json({
          data: { id: String(params.id), updated: true },
        })
      }),
    )

    await user.click(
      screen.getByRole('button', { name: 'Edit Fixture Company' }),
    )
    const phoneInput = screen.getByLabelText('Phone')
    await user.clear(phoneInput)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(
        screen.getByText('Updated account "Fixture Company".'),
      ).toBeInTheDocument(),
    )
    expect(capturedBody).toEqual({ phone: null })
  })

  it('shows a conflict prompt on a 412 response and refreshes on request', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Fixture Company')).toBeInTheDocument(),
    )

    server.use(
      http.patch('*/api/accounts/:id', () =>
        HttpResponse.json(
          {
            error: {
              code: 'PRECONDITION_FAILED',
              message: 'stale',
              requestId: 'req_test000000003',
            },
          },
          { status: 412 },
        ),
      ),
    )

    await user.click(
      screen.getByRole('button', { name: 'Edit Fixture Company' }),
    )
    await user.type(screen.getByLabelText('Phone'), '000')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(screen.getByText(/changed by someone else/)).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'Refresh accounts' }))
    await waitFor(() =>
      expect(
        screen.queryByText(/changed by someone else/),
      ).not.toBeInTheDocument(),
    )
  })

  it('cancels a delete without removing the account', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Fixture Company')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Delete Fixture Company' }),
    )
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Fixture Company')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText('Fixture Company')).toBeInTheDocument()
  })

  it('confirms a delete and removes the account after showing its name', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Fixture Company')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Delete Fixture Company' }),
    )
    const dialog = screen.getByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete Fixture Company' }),
    )

    await waitFor(() =>
      expect(
        screen.getByText('Deleted account "Fixture Company".'),
      ).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(screen.getByText(/No accounts yet/)).toBeInTheDocument(),
    )
  })

  it('closes the delete dialog on Escape (keyboard support)', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Fixture Company')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Delete Fixture Company' }),
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('shows a retry option when the initial load fails', async () => {
    server.use(http.get('*/api/accounts', () => HttpResponse.error()))
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(
      screen.getByText('Unable to reach the server. Please try again.'),
    ).toBeInTheDocument()

    server.resetHandlers()
    mockState.accounts = [buildFakeAccount()]
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() =>
      expect(screen.getByText('Fixture Company')).toBeInTheDocument(),
    )
  })

  it('shows an error and stops when loading more fails', async () => {
    mockState.accounts = buildFakeAccounts(60)
    const user = userEvent.setup()
    renderPage()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Load more' }),
      ).toBeInTheDocument(),
    )

    server.use(http.get('*/api/accounts', () => HttpResponse.error()))
    await user.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('closes the create dialog when Cancel is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Fixture Company')).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'New account' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the edit dialog when Cancel is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Fixture Company')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Edit Fixture Company' }),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders external website links with a safe scheme and safe rel/target', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Fixture Company')).toBeInTheDocument(),
    )

    const link = screen.getByRole('link', { name: 'https://example.test' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link.getAttribute('href')).toMatch(/^https:\/\//)
  })
})
