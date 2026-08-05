import type {
  Account,
  CreateAccountInput,
  UpdateAccountInput,
} from '@salesforce-account-app/shared'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiClient } from '../api/client.js'
import { ApiClientError } from '../api/client.js'
import { AccountForm } from './AccountForm.js'
import { AccountsTable } from './AccountsTable.js'
import { DeleteConfirmDialog } from './DeleteConfirmDialog.js'
import { Modal } from './Modal.js'
import { SearchBar, MIN_SEARCH_LENGTH } from './SearchBar.js'
import { useDebouncedValue } from './useDebouncedValue.js'

interface AccountsPageProps {
  apiClient: ApiClient
}

type LoadStatus = 'idle' | 'loading' | 'loadingMore' | 'error'

const describeError = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

const toHttpDate = (isoDate: string): string => new Date(isoDate).toUTCString()

export const AccountsPage = ({ apiClient }: AccountsPageProps) => {
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const effectiveSearch =
    debouncedSearch.trim().length >= MIN_SEARCH_LENGTH
      ? debouncedSearch.trim()
      : ''

  const [accounts, setAccounts] = useState<Account[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)

  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const loadFirstPage = useCallback(
    (search: string) => {
      const requestId = (requestIdRef.current += 1)
      setStatus('loading')
      setLoadError(null)
      apiClient
        .listAccounts({ search: search === '' ? undefined : search })
        .then((page) => {
          if (requestIdRef.current !== requestId) return
          setAccounts(page.data)
          setCursor(page.meta.nextCursor)
          setHasMore(page.meta.hasMore)
          setStatus('idle')
        })
        .catch((error: unknown) => {
          if (requestIdRef.current !== requestId) return
          setLoadError(describeError(error))
          setStatus('error')
        })
    },
    [apiClient],
  )

  useEffect(() => {
    loadFirstPage(effectiveSearch)
  }, [effectiveSearch, loadFirstPage])

  const loadMore = () => {
    if (cursor === null || status === 'loadingMore') return
    const requestId = (requestIdRef.current += 1)
    setStatus('loadingMore')
    setLoadError(null)
    apiClient
      .listAccounts({
        search: effectiveSearch === '' ? undefined : effectiveSearch,
        cursor,
      })
      .then((page) => {
        if (requestIdRef.current !== requestId) return
        setAccounts((previous) => [...previous, ...page.data])
        setCursor(page.meta.nextCursor)
        setHasMore(page.meta.hasMore)
        setStatus('idle')
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) return
        setLoadError(describeError(error))
        setStatus('error')
      })
  }

  const refresh = () => {
    loadFirstPage(effectiveSearch)
  }

  const handleCreate = (input: CreateAccountInput) => {
    setCreating(true)
    setCreateError(null)
    apiClient
      .createAccount(input)
      .then((result) => {
        setCreating(false)
        setShowCreateForm(false)
        setSuccessMessage(`Created account "${result.name}".`)
        refresh()
      })
      .catch((error: unknown) => {
        setCreating(false)
        setCreateError(describeError(error))
      })
  }

  const handleUpdate = (input: UpdateAccountInput) => {
    if (editingAccount === null) return
    setUpdating(true)
    setUpdateError(null)
    setConflictMessage(null)
    apiClient
      .updateAccount(
        editingAccount.id,
        input,
        toHttpDate(editingAccount.lastModifiedDate),
      )
      .then(() => {
        setUpdating(false)
        setEditingAccount(null)
        setSuccessMessage(`Updated account "${editingAccount.name}".`)
        refresh()
      })
      .catch((error: unknown) => {
        setUpdating(false)
        if (
          error instanceof ApiClientError &&
          error.code === 'PRECONDITION_FAILED'
        ) {
          setConflictMessage(
            'This account was changed by someone else since you opened it. Refresh to see the latest version before saving again.',
          )
          return
        }
        setUpdateError(describeError(error))
      })
  }

  const handleDelete = () => {
    if (deletingAccount === null) return
    setDeleting(true)
    setDeleteError(null)
    apiClient
      .deleteAccount(deletingAccount.id)
      .then(() => {
        setDeleting(false)
        setSuccessMessage(`Deleted account "${deletingAccount.name}".`)
        setDeletingAccount(null)
        refresh()
      })
      .catch((error: unknown) => {
        setDeleting(false)
        setDeleteError(describeError(error))
      })
  }

  return (
    <section aria-labelledby="accounts-heading" className="accounts-page">
      <div className="accounts-header">
        <h1 id="accounts-heading">Accounts</h1>
        <button
          type="button"
          onClick={() => {
            setShowCreateForm(true)
            setCreateError(null)
          }}
        >
          New account
        </button>
      </div>

      <SearchBar value={searchInput} onChange={setSearchInput} />

      <div aria-live="polite" className="status-region">
        {successMessage !== null && <p className="success">{successMessage}</p>}
      </div>

      {status === 'loading' && <p role="status">Loading accounts…</p>}

      {status === 'error' && (
        <div role="alert" className="form-error">
          <p>{loadError}</p>
          <button type="button" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      {status !== 'loading' && status !== 'error' && accounts.length === 0 && (
        <p className="empty-state">
          {effectiveSearch === ''
            ? 'No accounts yet. Create the first one to get started.'
            : `No accounts match "${effectiveSearch}".`}
        </p>
      )}

      {accounts.length > 0 && (
        <>
          <AccountsTable
            accounts={accounts}
            onEdit={(account) => {
              setEditingAccount(account)
              setUpdateError(null)
              setConflictMessage(null)
            }}
            onDelete={(account) => {
              setDeletingAccount(account)
              setDeleteError(null)
            }}
          />
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={status === 'loadingMore'}
            >
              {status === 'loadingMore' ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}

      {showCreateForm && (
        <Modal
          titleId="create-account-title"
          onClose={() => setShowCreateForm(false)}
        >
          <h2 id="create-account-title">New account</h2>
          <AccountForm
            mode="create"
            submitting={creating}
            serverError={createError}
            onCancel={() => setShowCreateForm(false)}
            onSubmitCreate={handleCreate}
          />
        </Modal>
      )}

      {editingAccount !== null && (
        <Modal
          titleId="edit-account-title"
          onClose={() => setEditingAccount(null)}
        >
          <h2 id="edit-account-title">Edit {editingAccount.name}</h2>
          {conflictMessage !== null && (
            <div role="alert" className="form-error">
              <p>{conflictMessage}</p>
              <button
                type="button"
                onClick={() => {
                  setEditingAccount(null)
                  setConflictMessage(null)
                  refresh()
                }}
              >
                Refresh accounts
              </button>
            </div>
          )}
          <AccountForm
            mode="edit"
            account={editingAccount}
            submitting={updating}
            serverError={updateError}
            onCancel={() => setEditingAccount(null)}
            onSubmitUpdate={handleUpdate}
          />
        </Modal>
      )}

      {deletingAccount !== null && (
        <DeleteConfirmDialog
          account={deletingAccount}
          deleting={deleting}
          error={deleteError}
          onCancel={() => setDeletingAccount(null)}
          onConfirm={handleDelete}
        />
      )}
    </section>
  )
}
