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
        : `Réponse vide de ${responseEndpoint} (${status}). Vérifiez le backend et le proxy Vite.`),
    )
  }

  if (response.status !== 204 && data === null) {
    throw new Error(
      `Réponse vide de ${responseEndpoint} (${status}). Le serveur n’a pas renvoyé les données attendues.`,
    )
  }

  return data
}
