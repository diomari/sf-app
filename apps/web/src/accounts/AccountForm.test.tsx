import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AccountForm } from './AccountForm.js'

describe('AccountForm', () => {
  it('surfaces field-level validation errors from the shared zod schema and does not submit', async () => {
    const onSubmitCreate = vi.fn()
    const user = userEvent.setup()

    render(
      <AccountForm
        mode="create"
        submitting={false}
        onCancel={vi.fn()}
        onSubmitCreate={onSubmitCreate}
      />,
    )

    // Name left blank and website malformed -> two schema violations.
    await user.type(screen.getByLabelText('Website'), 'not-a-url')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Name is required.')).toBeInTheDocument()
    expect(
      screen.getByText('Website must be a valid HTTP or HTTPS URL.'),
    ).toBeInTheDocument()
    expect(onSubmitCreate).not.toHaveBeenCalled()
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(<AccountForm mode="create" submitting={false} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('submits a valid create payload with only the filled fields', async () => {
    const onSubmitCreate = vi.fn()
    const user = userEvent.setup()

    render(
      <AccountForm
        mode="create"
        submitting={false}
        onCancel={vi.fn()}
        onSubmitCreate={onSubmitCreate}
      />,
    )

    await user.type(screen.getByLabelText('Name (required)'), 'Valid Co')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(onSubmitCreate).toHaveBeenCalledWith({ name: 'Valid Co' })
  })
})
