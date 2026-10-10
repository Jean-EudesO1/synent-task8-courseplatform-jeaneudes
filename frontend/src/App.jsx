import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useSearchParams,
  useNavigate,
} from 'react-router-dom'
import { postWithCsrf, readApiResponse } from './api.js'
import './App.css'

const AuthContext = createContext(null)

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authState, setAuthState] = useState('loading')
  const [sessionError, setSessionError] = useState('')
  const sessionRequestId = useRef(0)
  const channelRef = useRef(null)

  const refreshSession = useCallback(async () => {
    const requestId = ++sessionRequestId.current
    const response = await fetch('/api/auth/me', { credentials: 'include' })
    if (response.status === 401) {
      if (requestId === sessionRequestId.current) setUser(null)
      return null
    }

    const data = await readApiResponse(response, '/api/auth/me')
    if (requestId === sessionRequestId.current) setUser(data.user)
    return data.user
  }, [])

  useEffect(() => {
    let active = true

    async function initialize() {
      const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' })
      await readApiResponse(csrfResponse, '/api/auth/csrf')
      return refreshSession()
    }

    initialize()
      .then(() => {
        if (!active) return
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

  useEffect(() => {
    let active = true
    const syncSession = () => {
      refreshSession().catch((error) => {
        if (active) setSessionError(error.message)
      })
    }

    if (typeof BroadcastChannel !== 'undefined') {
      channelRef.current = new BroadcastChannel('course-platform-auth')
      channelRef.current.addEventListener('message', (event) => {
        if (event.data?.type === 'session-changed') syncSession()
      })
    } else {
      window.addEventListener('storage', syncSession)
    }

    return () => {
      active = false
      channelRef.current?.close()
      channelRef.current = null
      window.removeEventListener('storage', syncSession)
    }
  }, [refreshSession])

  function publishSessionChange() {
    if (typeof BroadcastChannel !== 'undefined') {
      channelRef.current?.postMessage({ type: 'session-changed' })
      return
    }

    localStorage.setItem('course-platform-auth-changed', String(Date.now()))
  }

  async function authenticate(path, credentials) {
    const data = await postWithCsrf(path, credentials)

    setUser(data.user)
    publishSessionChange()
  }

  async function signOut() {
    await postWithCsrf('/api/auth/logout', {})

    setUser(null)
    publishSessionChange()
  }

  return (
    <AuthContext.Provider value={{
      user,
      authState,
      sessionError,
      authenticate,
      signOut,
      postWithCsrf,
      refreshSession,
      publishSessionChange,
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
      {!isRegister && (
        <p className="form-footer">
          <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
        </p>
      )}
    </section>
  )
}

function Dashboard() {
  const { user, signOut, postWithCsrf, refreshSession } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [verificationMessage, setVerificationMessage] = useState('')
  const [verificationError, setVerificationError] = useState('')
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

  async function handleResendVerification() {
    setLoading(true)
    setVerificationMessage('')
    setVerificationError('')
    try {
      const result = await postWithCsrf('/api/auth/verification/resend', {})
      setVerificationMessage(result.message)
    } catch (requestError) {
      setVerificationError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel dashboard-panel">
      <p className="eyebrow">Espace étudiant</p>
      <h1>Bonjour, {user.name}</h1>
      <p className="intro">Vous êtes connecté à votre espace personnel.</p>
      <section className={`verification-status ${user.emailVerified ? 'verified' : 'unverified'}`}>
        <p>
          Adresse e-mail : <strong>{user.emailVerified ? 'vérifiée' : 'non vérifiée'}</strong>
        </p>
        {!user.emailVerified && (
          <>
            <p>Vous pouvez consulter votre espace. La vérification sera requise pour les futures inscriptions aux cours.</p>
            <button
              className="text-button"
              disabled={loading}
              onClick={handleResendVerification}
              type="button"
            >
              Renvoyer l’e-mail de vérification
            </button>
          </>
        )}
        {verificationMessage && <p className="action-message" role="status">{verificationMessage}</p>}
        {verificationError && <p className="notice error" role="alert">{verificationError}</p>}
      </section>

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

function VerifyEmailPage() {
  const { postWithCsrf, refreshSession, publishSessionChange } = useAuth()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState('')
  const token = searchParams.get('token')

  async function handleVerify() {
    if (!token) {
      setState('error')
      setMessage('Le lien de vérification est incomplet ou invalide.')
      return
    }

    setState('loading')
    setMessage('')
    try {
      const result = await postWithCsrf('/api/auth/verify-email', { token })
      await refreshSession()
      publishSessionChange()
      setState('success')
      setMessage(result.message)
    } catch (error) {
      setState('error')
      setMessage(error.message)
    }
  }

  return (
    <section className="panel auth-panel">
      <p className="eyebrow">Vérification de l’adresse</p>
      <h1>Vérifier mon e-mail</h1>
      <p className="intro">Confirmez votre adresse pour pouvoir vous inscrire aux cours.</p>
      {message && (
        <p className={`notice ${state === 'error' ? 'error' : ''}`} role={state === 'error' ? 'alert' : 'status'}>
          {message}
        </p>
      )}
      {state !== 'success' && (
        <button
          className="primary-button full-button"
          disabled={state === 'loading'}
          onClick={handleVerify}
          type="button"
        >
          {state === 'loading' ? 'Vérification…' : 'Confirmer mon adresse e-mail'}
        </button>
      )}
      <p className="form-footer"><Link to="/">Retour à mon espace</Link></p>
    </section>
  )
}

function ForgotPasswordPage() {
  const { postWithCsrf } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    try {
      const result = await postWithCsrf('/api/auth/forgot-password', { email })
      setMessage(result.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel auth-panel">
      <p className="eyebrow">Récupération du compte</p>
      <h1>Mot de passe oublié</h1>
      <p className="intro">Saisissez l’adresse associée à votre compte. Si elle existe, un lien de réinitialisation vous sera envoyé.</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Adresse e-mail
          <input
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        {message && <p className="notice" role="status">{message}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="primary-button" disabled={loading} type="submit">
          {loading ? 'Envoi…' : 'Demander un lien'}
        </button>
      </form>
      <p className="form-footer"><Link to="/connexion">Retour à la connexion</Link></p>
    </section>
  )
}

function ResetPasswordPage() {
  const { postWithCsrf, refreshSession, publishSessionChange } = useAuth()
  const [searchParams] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const token = searchParams.get('token')

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    try {
      const result = await postWithCsrf('/api/auth/reset-password', {
        token,
        password,
        confirmPassword,
      })
      await refreshSession()
      publishSessionChange()
      setMessage(result.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel auth-panel">
      <p className="eyebrow">Sécurité du compte</p>
      <h1>Nouveau mot de passe</h1>
      <p className="intro">Choisissez un nouveau mot de passe d’au moins 8 caractères et confirmez-le.</p>
      {!token && <p className="notice error" role="alert">Ce lien est incomplet ou invalide. Demandez une nouvelle réinitialisation.</p>}
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Nouveau mot de passe
          <input
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <label>
          Confirmer le mot de passe
          <input
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
        </label>
        {message && <p className="notice" role="status">{message}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {message.includes('Reconnectez-vous') ? (
          <Link className="primary-button button-link" to="/connexion">Aller à la connexion</Link>
        ) : (
          <button className="primary-button" disabled={loading || !token} type="submit">
            {loading ? 'Modification…' : 'Modifier le mot de passe'}
          </button>
        )}
      </form>
      <p className="form-footer"><Link to="/connexion">Retour à la connexion</Link></p>
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
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
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
