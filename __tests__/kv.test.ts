import { isVercelKvAvailable, kvDel, kvGet, kvSet, sanitizeEnvValue } from '@/lib/kv'

describe('sanitizeEnvValue', () => {
  it('trims whitespace and wrapping double quotes', () => {
    expect(sanitizeEnvValue('  "https://example.upstash.io"\n')).toBe('https://example.upstash.io')
  })

  it('trims whitespace and wrapping single quotes', () => {
    expect(sanitizeEnvValue("  'secret-token'  ")).toBe('secret-token')
  })

  it('returns undefined for blank values', () => {
    expect(sanitizeEnvValue('   \n  ')).toBeUndefined()
  })
})

describe('kv memory fallback', () => {
  const originalUrl = process.env.KV_REST_API_URL
  const originalToken = process.env.KV_REST_API_TOKEN

  beforeEach(async () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    await kvDel('test-key')
  })

  afterAll(() => {
    if (originalUrl === undefined) {
      delete process.env.KV_REST_API_URL
    } else {
      process.env.KV_REST_API_URL = originalUrl
    }

    if (originalToken === undefined) {
      delete process.env.KV_REST_API_TOKEN
    } else {
      process.env.KV_REST_API_TOKEN = originalToken
    }
  })

  it('does not consider malformed blank env values available', () => {
    process.env.KV_REST_API_URL = '  "  " '
    process.env.KV_REST_API_TOKEN = ' \n '

    expect(isVercelKvAvailable()).toBe(false)
  })

  it('reads and writes from the in-memory fallback when KV is unavailable', async () => {
    await kvSet('test-key', { ok: true }, 60)

    await expect(kvGet<{ ok: boolean }>('test-key')).resolves.toEqual({ ok: true })

    await kvDel('test-key')

    await expect(kvGet('test-key')).resolves.toBeNull()
  })
})