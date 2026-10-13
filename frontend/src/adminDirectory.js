export function isAdminDirectoryResponse(data, kind) {
  const isUsers = kind === 'users'
  const rows = isUsers ? data?.users : data?.enrollments
  const pagination = data?.pagination
  const validPagination = pagination
    && Number.isSafeInteger(pagination.page)
    && Number.isSafeInteger(pagination.limit)
    && Number.isSafeInteger(pagination.total)
    && Number.isSafeInteger(pagination.totalPages)
  const validRows = Array.isArray(rows) && rows.every((item) => {
    if (!item || typeof item.id !== 'string') return false
    if (isUsers) {
      return typeof item.name === 'string'
        && typeof item.email === 'string'
        && ['student', 'admin'].includes(item.role)
        && typeof item.emailVerified === 'boolean'
        && Number.isFinite(Date.parse(item.createdAt))
    }
    return typeof item.source === 'string'
      && item.user
      && typeof item.user.name === 'string'
      && typeof item.user.email === 'string'
      && item.course
      && typeof item.course.title === 'string'
      && item.progress
      && Number.isFinite(item.progress.percentage)
      && Number.isFinite(item.progress.completedCount)
      && Number.isFinite(item.progress.totalCount)
      && Number.isFinite(Date.parse(item.enrolledAt))
  })
  return Boolean(validRows && validPagination)
}
