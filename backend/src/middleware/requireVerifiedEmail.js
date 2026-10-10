export function requireVerifiedEmail(request, response, next) {
  if (!request.user?.emailVerified) {
    return response.status(403).json({
      message: 'Vérifiez votre adresse e-mail avant de vous inscrire à un cours.',
    })
  }

  return next()
}
