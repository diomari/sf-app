import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SafeWebsiteLink } from './SafeWebsiteLink.js'

describe('SafeWebsiteLink', () => {
  it('renders a placeholder when the website is null', () => {
    render(<SafeWebsiteLink website={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders a placeholder for an unparsable value', () => {
    render(<SafeWebsiteLink website="not a url" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a placeholder for a disallowed scheme even if syntactically valid', () => {
    render(<SafeWebsiteLink website="javascript:alert(1)" />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders a safe http/https link with noopener noreferrer', () => {
    render(<SafeWebsiteLink website="https://example.test" />)
    const link = screen.getByRole('link', { name: 'https://example.test' })
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
