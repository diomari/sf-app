import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { App } from './App.js'

describe('App shell', () => {
  it('renders the milestone shell without authentication or Account workflows', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('Salesforce Account Management')
    expect(markup).toContain('secure application shell is ready')
    expect(markup).not.toContain('clientSecret')
  })
})
