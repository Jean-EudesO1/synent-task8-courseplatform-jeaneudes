import assert from 'node:assert/strict'
import test from 'node:test'
import { getCsrfCookie, postWithCsrf, readApiResponse } from '../src/api.js'

test('lit le jeton CSRF courant du cookie sans conserver de cache local', () => {
  assert.equal(
    getCsrfCookie('theme=light; csrf_token=first-token; other=value'),
    'first-token',
  )
  assert.equal(
    getCsrfCookie('theme=light; csrf_token=second-token; other=value'),
    'second-token',
  )
  assert.equal(getCsrfCookie('theme=light'), '')
})

test('lit une réponse JSON valide', async () => {
  const response = new Response(JSON.stringify({ user: { name: 'Test' } }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })

  assert.deepEqual(await readApiResponse(response, '/api/auth/register'), {
    user: { name: 'Test' },
  })
})

test('signale une réponse vide avec le point de terminaison et le statut', async () => {
  const response = new Response(null, { status: 502, statusText: 'Bad Gateway' })

  await assert.rejects(
    readApiResponse(response, '/api/auth/csrf'),
    /Réponse vide de \/api\/auth\/csrf \(HTTP 502 Bad Gateway\).*backend et le proxy Vite/,
  )
})

test('signale le statut JSON d’une erreur serveur', async () => {
  const response = new Response(JSON.stringify({ message: 'Session requise.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })

  await assert.rejects(
    readApiResponse(response, '/api/auth/me'),
    /Session requise\./,
  )
})

test('inclut un extrait lisible pour une réponse non JSON', async () => {
  const response = new Response('<html><body>Backend unavailable</body></html>', {
    status: 502,
    statusText: 'Bad Gateway',
    headers: { 'Content-Type': 'text/html' },
  })

  await assert.rejects(
    readApiResponse(response, '/api/auth/register'),
    /Réponse non JSON pour \/api\/auth\/register \(HTTP 502 Bad Gateway\).*Backend unavailable/,
  )
})

test('accepte une réponse de déconnexion sans corps', async () => {
  const response = new Response(null, { status: 204 })

  assert.equal(await readApiResponse(response, '/api/auth/logout'), null)
})

test('synchronise un CSRF périmé sans rejouer la mutation refusée', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  let cookie = 'csrf_token=stale-token'
  let postCount = 0
  let csrfRefreshCount = 0

  globalThis.document = { get cookie() { return cookie } }
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) {
      csrfRefreshCount += 1
      cookie = 'csrf_token=current-token'
      return new Response(JSON.stringify({ csrfToken: 'current-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    postCount += 1
    assert.equal(options.headers['X-CSRF-Token'], 'stale-token')
    cookie = 'csrf_token=current-token'
    return new Response(JSON.stringify({ message: 'Jeton CSRF absent ou invalide.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    await assert.rejects(
      postWithCsrf('/api/auth/logout', {}),
      /jeton de sécurité était périmé.*recommencez manuellement/,
    )
    assert.equal(postCount, 1)
    assert.equal(csrfRefreshCount, 1)
    assert.equal(getCsrfCookie(), 'current-token')
  } finally {
    globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})
