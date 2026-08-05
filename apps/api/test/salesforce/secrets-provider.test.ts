import { describe, expect, it, vi } from 'vitest'

import { AppError } from '../../src/errors/app-error.js'
import { createSecretsProvider } from '../../src/salesforce/secrets-provider.js'

const VALID_SECRET_JSON = JSON.stringify({
  clientId: 'fixture-client-id',
  clientSecret: 'fixture-client-secret-value',
  loginUrl: 'https://fixture--sandbox.my.salesforce.com',
  cursorSigningKey: 'fixture-cursor-signing-key',
})

describe('createSecretsProvider', () => {
  it('parses and returns a valid secret payload', async () => {
    const fetchSecret = vi.fn().mockResolvedValue(VALID_SECRET_JSON)
    const provider = createSecretsProvider({
      secretArn: 'arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:sf',
      fetchSecret,
    })

    const secret = await provider.getSecret()

    expect(secret).toEqual({
      clientId: 'fixture-client-id',
      clientSecret: 'fixture-client-secret-value',
      loginUrl: 'https://fixture--sandbox.my.salesforce.com',
      cursorSigningKey: 'fixture-cursor-signing-key',
    })
  })

  it('only ever fetches the single configured secret ARN', async () => {
    const fetchSecret = vi.fn().mockResolvedValue(VALID_SECRET_JSON)
    const provider = createSecretsProvider({
      secretArn: 'arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:sf-only',
      fetchSecret,
    })

    await provider.getSecret()
    await provider.getSecret()

    expect(fetchSecret).toHaveBeenCalledTimes(1)
    expect(fetchSecret).toHaveBeenCalledWith(
      'arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:sf-only',
    )
  })

  it('coalesces concurrent callers into a single fetch (single-flight)', async () => {
    let resolveFetch: (value: string) => void = () => undefined
    const fetchSecret = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const provider = createSecretsProvider({
      secretArn: 'arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:sf',
      fetchSecret,
    })

    const first = provider.getSecret()
    const second = provider.getSecret()
    resolveFetch(VALID_SECRET_JSON)

    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(fetchSecret).toHaveBeenCalledTimes(1)
    expect(firstResult).toEqual(secondResult)
  })

  it.each([
    ['missing a required field', { clientId: 'id', loginUrl: 'https://x.my.salesforce.com', cursorSigningKey: 'key' }],
    ['containing an unknown key', { clientId: 'id', clientSecret: 'secret', loginUrl: 'https://x.my.salesforce.com', cursorSigningKey: 'key', extra: 'nope' }],
    ['with an empty client secret', { clientId: 'id', clientSecret: '', loginUrl: 'https://x.my.salesforce.com', cursorSigningKey: 'key' }],
  ])('rejects a secret payload %s with a typed error', async (_label, payload) => {
    const fetchSecret = vi.fn().mockResolvedValue(JSON.stringify(payload))
    const provider = createSecretsProvider({
      secretArn: 'arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:sf',
      fetchSecret,
    })

    await expect(provider.getSecret()).rejects.toThrow(AppError)
  })

  it('rejects a secret with a login URL outside the approved host allowlist', async () => {
    const fetchSecret = vi.fn().mockResolvedValue(
      JSON.stringify({
        clientId: 'id',
        clientSecret: 'secret',
        loginUrl: 'https://attacker.example.com',
        cursorSigningKey: 'key',
      }),
    )
    const provider = createSecretsProvider({
      secretArn: 'arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:sf',
      fetchSecret,
    })

    await expect(provider.getSecret()).rejects.toThrow(AppError)
  })

  it('rejects malformed (non-JSON) secret payloads', async () => {
    const fetchSecret = vi.fn().mockResolvedValue('not-json{{{')
    const provider = createSecretsProvider({
      secretArn: 'arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:sf',
      fetchSecret,
    })

    await expect(provider.getSecret()).rejects.toThrow(AppError)
  })

  it('never leaks the raw secret value in a thrown error message', async () => {
    const fetchSecret = vi
      .fn()
      .mockResolvedValue('{"clientSecret":"super-secret-value"')
    const provider = createSecretsProvider({
      secretArn: 'arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:sf',
      fetchSecret,
    })

    try {
      await provider.getSecret()
      throw new Error('expected getSecret to throw')
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(
        'super-secret-value',
      )
    }
  })

  it('allows a retry after a failed fetch instead of caching the failure', async () => {
    const fetchSecret = vi
      .fn()
      .mockRejectedValueOnce(new Error('secrets manager unavailable'))
      .mockResolvedValueOnce(VALID_SECRET_JSON)
    const provider = createSecretsProvider({
      secretArn: 'arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:sf',
      fetchSecret,
    })

    await expect(provider.getSecret()).rejects.toThrow()
    const secret = await provider.getSecret()

    expect(secret.clientId).toBe('fixture-client-id')
    expect(fetchSecret).toHaveBeenCalledTimes(2)
  })
})
