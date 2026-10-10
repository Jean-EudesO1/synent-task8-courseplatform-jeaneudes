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
  useParams,
  useSearchParams,
  useNavigate,
} from 'react-router-dom'
import { postWithCsrf, readApiResponse, requestWithCsrf } from './api.js'
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

function AdminRoute({ children }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') {
    return (
      <section className="panel">
        <h1>Accès réservé</h1>
        <p className="intro">Cette page est accessible uniquement aux administrateurs.</p>
        <Link className="primary-button button-link" to="/">Retour à mon espace</Link>
      </section>
    )
  }
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
      <Link className="primary-button button-link dashboard-catalog-link" to="/cours">
        Découvrir le catalogue
      </Link>
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

function formatPrice(price, currency) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
  }).format(price / 100)
}

function CourseCatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [courses, setCourses] = useState([])
  const [categories, setCategories] = useState([])
  const [pagination, setPagination] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    q: searchParams.get('q') || '',
    category: searchParams.get('category') || '',
    level: searchParams.get('level') || '',
  })
  const queryString = searchParams.toString()

  useEffect(() => {
    setFilters({
      q: searchParams.get('q') || '',
      category: searchParams.get('category') || '',
      level: searchParams.get('level') || '',
    })
  }, [queryString])

  useEffect(() => {
    const controller = new AbortController()
    const endpoint = `/api/courses${queryString ? `?${queryString}` : ''}`
    setState('loading')
    setError('')

    fetch(endpoint, { signal: controller.signal })
      .then((response) => readApiResponse(response, endpoint))
      .then((data) => {
        setCourses(data.courses)
        setCategories(data.categories)
        setPagination(data.pagination)
        setState('success')
      })
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return
        setError(requestError.message)
        setState('error')
      })

    return () => controller.abort()
  }, [queryString])

  function applyFilters(event) {
    event.preventDefault()
    const nextParams = new URLSearchParams()
    if (filters.q.trim()) nextParams.set('q', filters.q.trim())
    if (filters.category) nextParams.set('category', filters.category)
    if (filters.level) nextParams.set('level', filters.level)
    setSearchParams(nextParams)
  }

  function changePage(page) {
    const nextParams = new URLSearchParams(searchParams)
    if (page > 1) nextParams.set('page', String(page))
    else nextParams.delete('page')
    setSearchParams(nextParams)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className="catalog-page">
      <div className="catalog-heading">
        <p className="eyebrow">Apprendre à votre rythme</p>
        <h1>Catalogue des cours</h1>
        <p className="intro">Trouvez le cours qui vous aidera à atteindre votre prochain objectif.</p>
      </div>
      <form className="course-filters" onSubmit={applyFilters}>
        <label>
          Rechercher
          <input
            aria-label="Rechercher un cours"
            onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            placeholder="Titre ou description"
            type="search"
            value={filters.q}
          />
        </label>
        <label>
          Catégorie
          <select
            onChange={(event) => setFilters({ ...filters, category: event.target.value })}
            value={filters.category}
          >
            <option value="">Toutes les catégories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label>
          Niveau
          <select
            onChange={(event) => setFilters({ ...filters, level: event.target.value })}
            value={filters.level}
          >
            <option value="">Tous les niveaux</option>
            <option value="Débutant">Débutant</option>
            <option value="Intermédiaire">Intermédiaire</option>
            <option value="Avancé">Avancé</option>
          </select>
        </label>
        <button className="primary-button" type="submit">Rechercher</button>
      </form>

      {state === 'loading' && <p className="notice" role="status">Chargement des cours…</p>}
      {state === 'error' && <p className="notice error" role="alert">Impossible de charger le catalogue : {error}</p>}
      {state === 'success' && courses.length === 0 && (
        <p className="notice empty-courses" role="status">Aucun cours ne correspond à votre recherche.</p>
      )}
      {state === 'success' && courses.length > 0 && (
        <>
          <div className="course-grid">
            {courses.map((course) => (
              <article className="course-card" key={course.id}>
                <Link className="course-card-link" to={`/cours/${course.id}`}>
                  <img
                    alt=""
                    className="course-image"
                    onError={(event) => { event.currentTarget.src = '/courses/course-placeholder.svg' }}
                    src={course.image || '/courses/course-placeholder.svg'}
                  />
                  <div className="course-card-content">
                    <span className="course-category">{course.category}</span>
                    <h2>{course.title}</h2>
                    <p>{course.description}</p>
                    <span className="course-level">{course.level}</span>
                    <strong className="course-price">{formatPrice(course.price, course.currency)}</strong>
                  </div>
                </Link>
              </article>
            ))}
          </div>
          {pagination.pages > 1 && (
            <nav aria-label="Pagination du catalogue" className="pagination">
              <button
                className="secondary-button"
                disabled={pagination.page <= 1}
                onClick={() => changePage(pagination.page - 1)}
                type="button"
              >
                Précédent
              </button>
              <span>Page {pagination.page} sur {pagination.pages}</span>
              <button
                className="secondary-button"
                disabled={pagination.page >= pagination.pages}
                onClick={() => changePage(pagination.page + 1)}
                type="button"
              >
                Suivant
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}

function CourseDetailsPage() {
  const { id } = useParams()
  const [course, setCourse] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const endpoint = `/api/courses/${encodeURIComponent(id)}`
    setState('loading')
    setError('')

    fetch(endpoint, { signal: controller.signal })
      .then((response) => readApiResponse(response, endpoint))
      .then((data) => {
        setCourse(data.course)
        setState('success')
      })
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return
        setError(requestError.message)
        setState('error')
      })

    return () => controller.abort()
  }, [id])

  if (state === 'loading') return <p className="notice" role="status">Chargement du cours…</p>
  if (state === 'error') {
    return (
      <section className="panel course-error">
        <h1>Cours indisponible</h1>
        <p className="notice error" role="alert">{error}</p>
        <Link className="text-button" to="/cours">Retour au catalogue</Link>
      </section>
    )
  }

  return (
    <article className="course-details">
      <Link className="back-link" to="/cours">← Retour au catalogue</Link>
      <img
        alt=""
        className="details-image"
        onError={(event) => { event.currentTarget.src = '/courses/course-placeholder.svg' }}
        src={course.image || '/courses/course-placeholder.svg'}
      />
      <div className="details-body">
        <p className="eyebrow">{course.category} · {course.level}</p>
        <h1>{course.title}</h1>
        <p className="details-description">{course.description}</p>
        <p className="details-price">{formatPrice(course.price, course.currency)}</p>
        <section className="curriculum">
          <h2>Programme du cours</h2>
          {course.modules.length === 0 ? (
            <p className="notice">Le programme sera bientôt disponible.</p>
          ) : (
            <ol className="module-list">
              {course.modules.map((module, moduleIndex) => (
                <li key={`${module.title}-${moduleIndex}`}>
                  <h3>{module.title}</h3>
                  {module.lessons.length > 0 ? (
                    <ul>
                      {module.lessons.map((lesson, lessonIndex) => (
                        <li key={`${lesson.title}-${lessonIndex}`}>
                          <span>{lesson.title}</span>
                          {lesson.durationMinutes > 0 && <span>{lesson.durationMinutes} min</span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="lesson-empty">Aucune leçon listée.</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </article>
  )
}

const emptyCourse = () => ({
  title: '',
  description: '',
  category: '',
  level: 'Débutant',
  image: '/courses/course-placeholder.svg',
  price: 0,
  currency: 'INR',
  status: 'draft',
  modules: [],
})

function prepareCourseForEditor(course) {
  return {
    ...course,
    modules: course.modules.map((module) => ({
      ...module,
      _key: module._id || crypto.randomUUID(),
      lessons: module.lessons.map((lesson) => ({
        ...lesson,
        _key: lesson._id || crypto.randomUUID(),
      })),
    })),
  }
}

function coursePayload(course) {
  return {
    title: course.title,
    description: course.description,
    category: course.category,
    level: course.level,
    image: course.image,
    price: course.price,
    currency: course.currency,
    status: course.status,
    modules: course.modules.map(({ _key, ...module }) => ({
      ...(module._id ? { _id: module._id } : {}),
      title: module.title,
      lessons: module.lessons.map(({ _key: lessonKey, ...lesson }) => ({
        ...(lesson._id ? { _id: lesson._id } : {}),
        title: lesson.title,
        durationMinutes: lesson.durationMinutes,
        videoUrl: lesson.videoUrl,
        content: lesson.content,
      })),
    })),
  }
}

function moveItem(items, index, direction) {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= items.length) return items
  const reordered = [...items]
  ;[reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]]
  return reordered
}

function AdminPage() {
  const [courses, setCourses] = useState([])
  const [course, setCourse] = useState(emptyCourse)
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadCourses() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/courses', { credentials: 'include' })
      const data = await readApiResponse(response, '/api/admin/courses')
      setCourses(data.courses)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCourses()
  }, [])

  function startNewCourse() {
    setSelectedId('')
    setCourse(emptyCourse())
    setError('')
    setMessage('')
  }

  function editCourse(item) {
    setSelectedId(item._id)
    setCourse(prepareCourseForEditor(item))
    setError('')
    setMessage('')
  }

  function updateCourse(field, value) {
    setCourse((current) => ({ ...current, [field]: value }))
  }

  function updateModule(moduleIndex, field, value) {
    setCourse((current) => ({
      ...current,
      modules: current.modules.map((module, index) => (
        index === moduleIndex ? { ...module, [field]: value } : module
      )),
    }))
  }

  function updateLesson(moduleIndex, lessonIndex, field, value) {
    setCourse((current) => ({
      ...current,
      modules: current.modules.map((module, index) => index !== moduleIndex
        ? module
        : {
          ...module,
          lessons: module.lessons.map((lesson, currentLessonIndex) => (
            currentLessonIndex === lessonIndex
              ? { ...lesson, [field]: value }
              : lesson
          )),
        }),
    }))
  }

  function addModule() {
    setCourse((current) => ({
      ...current,
      modules: [...current.modules, { _key: crypto.randomUUID(), title: '', lessons: [] }],
    }))
  }

  function addLesson(moduleIndex) {
    setCourse((current) => ({
      ...current,
      modules: current.modules.map((module, index) => index === moduleIndex
        ? {
          ...module,
          lessons: [...module.lessons, {
            _key: crypto.randomUUID(),
            title: '',
            durationMinutes: 0,
            videoUrl: '',
            content: '',
          }],
        }
        : module),
    }))
  }

  async function saveCourse(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const path = selectedId
        ? `/api/admin/courses/${selectedId}`
        : '/api/admin/courses'
      const method = selectedId ? 'PUT' : 'POST'
      const result = await requestWithCsrf(path, {
        method,
        body: coursePayload(course),
      })
      setSelectedId(result.course._id)
      setCourse(prepareCourseForEditor(result.course))
      setMessage(course.status === 'published'
        ? 'Le cours est enregistré et publié.'
        : 'Le brouillon est enregistré.')
      await loadCourses()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteCourse(item) {
    if (!window.confirm(`Supprimer définitivement « ${item.title} » ?`)) return
    setError('')
    setMessage('')
    try {
      await requestWithCsrf(`/api/admin/courses/${item._id}`, { method: 'DELETE' })
      if (selectedId === item._id) startNewCourse()
      setCourses((current) => current.filter((entry) => entry._id !== item._id))
      setMessage('Le cours a été supprimé.')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Gestion de la plateforme</p>
          <h1>Administration des cours</h1>
          <p className="intro">Créez des cours, organisez leur programme et gérez leur publication.</p>
        </div>
        <button className="primary-button" onClick={startNewCourse} type="button">
          Nouveau cours
        </button>
      </div>
      {(error || message) && (
        <p className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
          {error || message}
        </p>
      )}
      <div className="admin-layout">
        <aside className="admin-course-list">
          <h2>Cours ({courses.length})</h2>
          {loading ? (
            <p className="notice" role="status">Chargement des cours…</p>
          ) : courses.length === 0 ? (
            <p className="empty-admin-list">Aucun cours pour le moment.</p>
          ) : (
            <ul>
              {courses.map((item) => (
                <li className={selectedId === item._id ? 'selected' : ''} key={item._id}>
                  <button className="admin-course-select" onClick={() => editCourse(item)} type="button">
                    <strong>{item.title}</strong>
                    <span className={`status-pill ${item.status}`}>
                      {item.status === 'published' ? 'Publié' : 'Brouillon'}
                    </span>
                  </button>
                  <button
                    aria-label={`Supprimer ${item.title}`}
                    className="delete-course-button"
                    onClick={() => deleteCourse(item)}
                    type="button"
                  >
                    Supprimer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <form className="admin-editor" onSubmit={saveCourse}>
          <h2>{selectedId ? 'Modifier le cours' : 'Créer un cours'}</h2>
          <div className="admin-fields">
            <label>
              Titre
              <input
                maxLength="160"
                onChange={(event) => updateCourse('title', event.target.value)}
                required
                value={course.title}
              />
            </label>
            <label>
              Catégorie
              <input
                maxLength="80"
                onChange={(event) => updateCourse('category', event.target.value)}
                required
                value={course.category}
              />
            </label>
            <label className="admin-field-wide">
              Description
              <textarea
                maxLength="5000"
                onChange={(event) => updateCourse('description', event.target.value)}
                required
                rows="4"
                value={course.description}
              />
            </label>
            <label>
              Niveau
              <select onChange={(event) => updateCourse('level', event.target.value)} value={course.level}>
                <option>Débutant</option>
                <option>Intermédiaire</option>
                <option>Avancé</option>
              </select>
            </label>
            <label>
              Prix (paise, entier)
              <input
                min="0"
                onChange={(event) => updateCourse(
                  'price',
                  event.target.value === '' ? '' : Number(event.target.value),
                )}
                required
                step="1"
                type="number"
                value={course.price}
              />
            </label>
            <label>
              Devise
              <input disabled value="INR" />
            </label>
            <label>
              Publication
              <select onChange={(event) => updateCourse('status', event.target.value)} value={course.status}>
                <option value="draft">Brouillon</option>
                <option value="published">Publié</option>
              </select>
            </label>
            <label className="admin-field-wide">
              Image (chemin local ou URL HTTP/HTTPS)
              <input
                maxLength="2048"
                onChange={(event) => updateCourse('image', event.target.value)}
                value={course.image}
              />
            </label>
          </div>

          <div className="admin-section-heading">
            <div>
              <h3>Modules et leçons</h3>
              <p>Les URL vidéo sont privées et ne figurent pas dans le catalogue public.</p>
            </div>
            <button className="secondary-button compact-button" onClick={addModule} type="button">
              Ajouter un module
            </button>
          </div>
          {course.modules.map((module, moduleIndex) => (
            <section className="admin-module" key={module._key}>
              <div className="admin-module-heading">
                <label>
                  Module {moduleIndex + 1}
                  <input
                    maxLength="160"
                    onChange={(event) => updateModule(moduleIndex, 'title', event.target.value)}
                    required
                    value={module.title}
                  />
                </label>
                <div className="editor-actions">
                  <button
                    aria-label={`Déplacer le module ${moduleIndex + 1} vers le haut`}
                    className="icon-button"
                    disabled={moduleIndex === 0}
                    onClick={() => setCourse((current) => ({
                      ...current,
                      modules: moveItem(current.modules, moduleIndex, -1),
                    }))}
                    type="button"
                  >↑</button>
                  <button
                    aria-label={`Déplacer le module ${moduleIndex + 1} vers le bas`}
                    className="icon-button"
                    disabled={moduleIndex === course.modules.length - 1}
                    onClick={() => setCourse((current) => ({
                      ...current,
                      modules: moveItem(current.modules, moduleIndex, 1),
                    }))}
                    type="button"
                  >↓</button>
                  <button
                    className="text-button danger-text"
                    onClick={() => setCourse((current) => ({
                      ...current,
                      modules: current.modules.filter((_, index) => index !== moduleIndex),
                    }))}
                    type="button"
                  >Supprimer</button>
                </div>
              </div>
              {module.lessons.map((lesson, lessonIndex) => (
                <div className="admin-lesson" key={lesson._key}>
                  <div className="admin-lesson-heading">
                    <strong>Leçon {lessonIndex + 1}</strong>
                    <div className="editor-actions">
                      <button
                        aria-label={`Déplacer la leçon ${lessonIndex + 1} vers le haut`}
                        className="icon-button"
                        disabled={lessonIndex === 0}
                        onClick={() => setCourse((current) => ({
                          ...current,
                          modules: current.modules.map((entry, index) => index === moduleIndex
                            ? { ...entry, lessons: moveItem(entry.lessons, lessonIndex, -1) }
                            : entry),
                        }))}
                        type="button"
                      >↑</button>
                      <button
                        aria-label={`Déplacer la leçon ${lessonIndex + 1} vers le bas`}
                        className="icon-button"
                        disabled={lessonIndex === module.lessons.length - 1}
                        onClick={() => setCourse((current) => ({
                          ...current,
                          modules: current.modules.map((entry, index) => index === moduleIndex
                            ? { ...entry, lessons: moveItem(entry.lessons, lessonIndex, 1) }
                            : entry),
                        }))}
                        type="button"
                      >↓</button>
                      <button
                        className="text-button danger-text"
                        onClick={() => setCourse((current) => ({
                          ...current,
                          modules: current.modules.map((entry, index) => index === moduleIndex
                            ? { ...entry, lessons: entry.lessons.filter((_, i) => i !== lessonIndex) }
                            : entry),
                        }))}
                        type="button"
                      >Supprimer</button>
                    </div>
                  </div>
                  <div className="admin-fields">
                    <label>
                      Titre de la leçon
                      <input
                        maxLength="160"
                        onChange={(event) => updateLesson(moduleIndex, lessonIndex, 'title', event.target.value)}
                        required
                        value={lesson.title}
                      />
                    </label>
                    <label>
                      Durée (minutes)
                      <input
                        min="0"
                        onChange={(event) => updateLesson(
                          moduleIndex,
                          lessonIndex,
                          'durationMinutes',
                          event.target.value === '' ? '' : Number(event.target.value),
                        )}
                        required
                        step="1"
                        type="number"
                        value={lesson.durationMinutes}
                      />
                    </label>
                    <label className="admin-field-wide">
                      URL vidéo (HTTP/HTTPS)
                      <input
                        maxLength="2048"
                        onChange={(event) => updateLesson(moduleIndex, lessonIndex, 'videoUrl', event.target.value)}
                        placeholder="https://exemple.test/video"
                        type="url"
                        value={lesson.videoUrl}
                      />
                    </label>
                    <label className="admin-field-wide">
                      Contenu privé facultatif
                      <textarea
                        maxLength="20000"
                        onChange={(event) => updateLesson(moduleIndex, lessonIndex, 'content', event.target.value)}
                        rows="2"
                        value={lesson.content}
                      />
                    </label>
                  </div>
                </div>
              ))}
              <button className="text-button add-lesson-button" onClick={() => addLesson(moduleIndex)} type="button">
                Ajouter une leçon
              </button>
            </section>
          ))}
          {course.modules.length === 0 && (
            <p className="empty-admin-list">Aucun module. Ajoutez un module pour définir le programme.</p>
          )}
          <div className="admin-save-row">
            <span>Le prix est enregistré en INR paise.</span>
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? 'Enregistrement…' : 'Enregistrer le cours'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

function SiteHeader() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSignOut() {
    setBusy(true)
    setError('')
    try {
      await signOut()
      navigate('/cours')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/cours">Plateforme de cours</Link>
        <nav aria-label="Navigation principale">
          <Link to="/cours">Catalogue</Link>
          {user ? (
            <>
              <Link to="/">Mon espace</Link>
              {user.role === 'admin' && <Link to="/administration">Administration</Link>}
              <button className="nav-button" disabled={busy} onClick={handleSignOut} type="button">
                {busy ? 'Déconnexion…' : 'Déconnexion'}
              </button>
            </>
          ) : (
            <>
              <Link to="/connexion">Connexion</Link>
              <Link className="nav-register" to="/inscription">Inscription</Link>
            </>
          )}
        </nav>
      </header>
      {error && <p className="notice error header-error" role="alert">{error}</p>}
    </>
  )
}

function AppRoutes() {
  const { authState, sessionError } = useAuth()

  if (authState === 'loading') return <LoadingMessage />
  if (authState === 'error') return <p className="notice error" role="alert">{sessionError}</p>

  return (
    <>
      <SiteHeader />
      <main className="page-content">
        <Routes>
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/cours" element={<CourseCatalogPage />} />
          <Route path="/cours/:id" element={<CourseDetailsPage />} />
          <Route
            path="/administration"
            element={<ProtectedRoute><AdminRoute><AdminPage /></AdminRoute></ProtectedRoute>}
          />
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
