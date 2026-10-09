import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [health, setHealth] = useState({ state: 'loading', data: null })

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`L’API a répondu avec le statut ${response.status}.`)
        }

        return response.json()
      })
      .then((data) => setHealth({ state: 'success', data }))
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setHealth({ state: 'error', data: error.message })
        }
      })

    return () => controller.abort()
  }, [])

  return (
    <main className="health-card">
      <h1>Plateforme de cours en ligne</h1>
      <p className="intro">Vérification de la connexion entre React et l’API.</p>

      {health.state === 'loading' && (
        <p className="status" role="status">Chargement de l’API…</p>
      )}

      {health.state === 'error' && (
        <p className="status error" role="alert">
          Impossible de joindre l’API : {health.data}
          <br />
          Vérifiez que le backend est démarré sur le port 5000.
        </p>
      )}

      {health.state === 'success' && (
        <section className="status success" aria-live="polite">
          <p>API : {health.data.status}</p>
          <p>Base MongoDB : {health.data.database}</p>
          {health.data.database !== 'connected' && (
            <p className="database-note">
              La connexion MongoDB n’est pas confirmée. Renseignez
              MONGODB_URI dans backend/.env et vérifiez l’état indiqué.
            </p>
          )}
        </section>
      )}
    </main>
  )
}

export default App
