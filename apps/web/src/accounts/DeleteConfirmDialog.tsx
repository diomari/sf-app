import type { Account } from '@salesforce-account-app/shared'
import { useEffect, useRef } from 'react'

interface DeleteConfirmDialogProps {
  account: Account
  deleting: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => void
}

/** D-16: delete requires explicit confirmation showing the Account name. */
export const DeleteConfirmDialog = ({
  account,
  deleting,
  error,
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-dialog-title">Delete account</h2>
        <p id="delete-dialog-description">
          Are you sure you want to delete <strong>{account.name}</strong>? This
          action cannot be undone.
        </p>
        {error !== null && error !== undefined && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            className="danger"
            ref={confirmButtonRef}
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : `Delete ${account.name}`}
          </button>
        </div>
      </div>
    </div>
  )
}
