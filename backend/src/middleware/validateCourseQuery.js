const allowedLevels = new Set(['Débutant', 'Intermédiaire', 'Avancé'])

export function validateCourseQuery(request, response, next) {
  const { q, category, level, page = '1', limit = '9' } = request.query

  if (
    (q !== undefined && (typeof q !== 'string' || q.trim().length > 100))
    || (category !== undefined && (
      typeof category !== 'string'
      || !category.trim()
      || category.trim().length > 80
    ))
    || (level !== undefined && (
      typeof level !== 'string'
      || !allowedLevels.has(level)
    ))
    || !/^[1-9]\d*$/.test(String(page))
    || !/^[1-9]\d*$/.test(String(limit))
    || Number(page) > 100000
    || Number(limit) > 50
  ) {
    return response.status(400).json({
      message: 'Paramètres invalides. Vérifiez la recherche, le niveau et la pagination (limite maximale : 50).',
    })
  }

  request.validatedCourseQuery = {
    q: q?.trim() || '',
    category: category?.trim() || '',
    level: level || '',
    page: Number(page),
    limit: Number(limit),
  }
  return next()
}
