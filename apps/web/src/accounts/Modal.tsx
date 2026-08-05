import type { ReactNode } from 'react'
import { useEffect } from 'react'

interface ModalProps {
  titleId: string
  onClose: () => void
  children: ReactNode
}

/** Backdrop click and Escape both close the modal, matching native dialog UX. */
export const Modal = ({ titleId, onClose, children }: ModalProps) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
