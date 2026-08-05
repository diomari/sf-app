import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Modal } from './Modal.js'

describe('Modal', () => {
  it('does not close when clicking inner content', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <Modal titleId="t" onClose={onClose}>
        <h2 id="t">Title</h2>
        <button type="button">Inner</button>
      </Modal>,
    )

    await user.click(screen.getByRole('button', { name: 'Inner' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <Modal titleId="t" onClose={onClose}>
        <h2 id="t">Title</h2>
      </Modal>,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on backdrop click', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Modal titleId="t" onClose={onClose}>
        <h2 id="t">Title</h2>
      </Modal>,
    )

    const backdrop = container.querySelector('.dialog-backdrop')
    if (backdrop === null) throw new Error('backdrop missing')
    fireEvent.click(backdrop)

    expect(onClose).toHaveBeenCalledOnce()
  })
})
