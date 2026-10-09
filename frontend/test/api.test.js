import assert from 'node:assert/strict'
import test from 'node:test'
import { readApiResponse } from '../src/api.js'

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
