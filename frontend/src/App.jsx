import { createContext, useContext, useEffect, useState } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { readApiResponse } from './api.js'
import './App.css'

const AuthContext = createContext(null)

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [csrfToken, setCsrfToken] = useState('')
  const [authState, setAuthState] = useState('loading')
  const [sessionError, setSessionError] = useState('')

  useEffect(() => {
    let active = true

    Promise.all([
      fetch('/api/auth/csrf', { credentials: 'include' })
        .then((response) => readApiResponse(response, '/api/auth/csrf')),
      fetch('/api/auth/me', { credentials: 'include' }).then(async (response) => {
        if (response.status === 401) return null
        return readApiResponse(response, '/api/auth/me')
      }),
    ])
      .then(([csrf, session]) => {
        if (!active) return
        setCsrfToken(csrf.csrfToken)
        setUser(session?.user || null)
        setAuthState('ready')
      })
      .catch((error) => {
        if (!active) return
        setSessionError(error.message)
        setAuthState('error')
      })

    return () => {
      active = false
    }
  }, [])

  async function authenticate(path, credentials) {
    if (!csrfToken) throw new Error('Jeton de sécurité indisponible. Rechargez la page.')

    const data = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify(credentials),
    }).then((response) => readApiResponse(response, path))

    setUser(data.user)
  }

  async function signOut() {
    if (!csrfToken) throw new Error('Jeton de sécurité indisponible. Rechargez la page.')

    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken },
    }).then((response) => readApiResponse(response, '/api/auth/logout'))

    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      authState,
      sessionError,
      authenticate,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

function useAuth() {
  return useContext(AuthContext)
}

function LoadingMessage() {
  return <p className="notice" role="status">Vérification de votre session…</p>
}

function ProtectedRoute({ children }) {
  const { authState, sessionError, user } = useAuth()

  if (authState === 'loading') return <LoadingMessage />
  if (authState === 'error') return <p className="notice error" role="alert">{sessionError}</p>
  if (!user) return <Navigate to="/connexion" replace />
  return children
}

function GuestRoute({ children }) {
  const { authState, sessionError, user } = useAuth()

  if (authState === 'loading') return <LoadingMessage />
  if (authState === 'error') return <p className="notice error" role="alert">{sessionError}</p>
  if (user) return <Navigate to="/" replace />
  return children
}

function AuthForm({ mode }) {
  const isRegister = mode === 'register'
  const { authenticate } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      await authenticate(
        isRegister ? '/api/auth/register' : '/api/auth/login',
        form,
      )
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel auth-panel">
      <p className="eyebrow">{isRegister ? 'Créer un compte' : 'Bienvenue'}</p>
      <h1>{isRegister ? 'Inscription' : 'Connexion'}</h1>
      <p className="intro">
        {isRegister
          ? 'Créez votre compte étudiant pour commencer.'
          : 'Connectez-vous à votre espace étudiant.'}
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        {isRegister && (
          <label>
            Nom
            <input
              autoComplete="name"
              maxLength={80}
              minLength={2}
              name="name"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              value={form.name}
            />
          </label>
        )}
        <label>
          Adresse e-mail
          <input
            autoComplete="email"
            name="email"
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
            type="email"
            value={form.email}
          />
        </label>
        <label>
          Mot de passe
          <input
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            minLength={isRegister ? 8 : undefined}
            name="password"
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
            type="password"
            value={form.password}
          />
          {isRegister && <span className="field-hint">8 caractères minimum</span>}
        </label>

        {error && <p className="notice error" role="alert">{error}</p>}

        <button className="primary-button" disabled={loading} type="submit">
          {loading
            ? 'Veuillez patienter…'
            : isRegister ? 'Créer mon compte' : 'Se connecter'}
        </button>
      </form>

      <p className="form-footer">
        {isRegister ? 'Vous avez déjà un compte ?' : 'Pas encore de compte ?'}{' '}
        <Link to={isRegister ? '/connexion' : '/inscription'}>
          {isRegister ? 'Se connecter' : 'Créer un compte'}
        </Link>
      </p>
    </section>
  )
}

function Dashboard() {
  const { user, signOut } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [health, setHealth] = useState({ state: 'loading', data: null })

  useEffect(() => {
    fetch('/api/health')
      .then((response) => readApiResponse(response, '/api/health'))
      .then((data) => setHealth({ state: 'success', data }))
      .catch((error) => setHealth({ state: 'error', data: error.message }))
  }, [])

  async function handleSignOut() {
    setLoading(true)
    setError('')
    try {
      await signOut()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel dashboard-panel">
      <p className="eyebrow">Espace étudiant</p>
      <h1>Bonjour, {user.name}</h1>
      <p className="intro">Vous êtes connecté à votre espace personnel.</p>
      <div className="account-details">
        <span>Adresse e-mail</span>
        <strong>{user.email}</strong>
        <span>Rôle</span>
        <strong>{user.role === 'admin' ? 'Administrateur' : 'Étudiant'}</strong>
      </div>
      {health.state === 'loading' && (
        <p className="health-line" role="status">Vérification de l’API…</p>
      )}
      {health.state === 'success' && (
        <p className="health-line" role="status">
          API : {health.data.status} · Base MongoDB : {health.data.database}
        </p>
      )}
      {health.state === 'error' && (
        <p className="notice error" role="alert">Vérification de l’API impossible : {health.data}</p>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      <button
        className="secondary-button"
        disabled={loading}
        onClick={handleSignOut}
        type="button"
      >
        {loading ? 'Déconnexion…' : 'Déconnexion'}
      </button>
    </section>
  )
}

function AppRoutes() {
  const { authState, sessionError } = useAuth()

  if (authState === 'loading') return <LoadingMessage />
  if (authState === 'error') return <p className="notice error" role="alert">{sessionError}</p>

  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/">Plateforme de cours</Link>
        <nav aria-label="Navigation principale">
          <Link to="/connexion">Connexion</Link>
          <Link className="nav-register" to="/inscription">Inscription</Link>
        </nav>
      </header>
      <main className="page-content">
        <Routes>
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/connexion" element={<GuestRoute><AuthForm mode="login" /></GuestRoute>} />
          <Route path="/inscription" element={<GuestRoute><AuthForm mode="register" /></GuestRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
