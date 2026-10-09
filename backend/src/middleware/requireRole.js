export function requireRole(role) {
  return (request, response, next) => {
    if (request.user?.role !== role) {
      return response.status(403).json({ message: 'Accès réservé à un administrateur.' })
    }

    return next()
  }
}
