export async function readApiResponse(response, endpoint = 'requête API') {
  const responseEndpoint = response.url
    ? new URL(response.url).pathname
    : endpoint
  const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
  const body = await response.text()
  let data = null

  if (body.trim()) {
    try {
      data = JSON.parse(body)
    } catch {
      const detail = body
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180)

      throw new Error(
        `Réponse non JSON pour ${responseEndpoint} (${status}). Détail : ${detail || 'corps illisible.'}`,
      )
    }
  }

  if (!response.ok) {
    throw new Error(
      data?.message
      || (body.trim()
        ? `Échec de ${responseEndpoint} (${status}).`
        : `Réponse vide de ${responseEndpoint} (${status}). Réessayez dans un instant.`),
    )
  }

  if (response.status !== 204 && data === null) {
    throw new Error(
      `Réponse vide de ${responseEndpoint} (${status}). Le serveur n’a pas renvoyé les données attendues.`,
    )
  }

  return data
}

export function getCsrfCookie(cookieString = document.cookie) {
  const cookie = cookieString
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('csrf_token='))

  return cookie ? decodeURIComponent(cookie.slice('csrf_token='.length)) : ''
}

async function bootstrapCsrfCookie() {
  const response = await fetch('/api/auth/csrf', { credentials: 'include' })
  await readApiResponse(response, '/api/auth/csrf')
}

export async function requestWithCsrf(path, { method = 'POST', body = {} } = {}) {
  let csrfToken = getCsrfCookie()
  if (!csrfToken) {
    await bootstrapCsrfCookie()
    csrfToken = getCsrfCookie()
  }
  if (!csrfToken) {
    throw new Error('Jeton de sécurité indisponible. Rechargez la page.')
  }

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(body),
  })

  try {
    return await readApiResponse(response, path)
  } catch (error) {
    if (
      response.status === 403
      && error.message.includes('Jeton CSRF absent ou invalide')
    ) {
      try {
        await bootstrapCsrfCookie()
      } catch {
        throw error
      }

      throw new Error(
        'La requête a été refusée car le jeton de sécurité était périmé. Il a été actualisé ; recommencez manuellement cette action.',
      )
    }

    throw error
  }
}

export function postWithCsrf(path, body) {
  return requestWithCsrf(path, { method: 'POST', body })
}
