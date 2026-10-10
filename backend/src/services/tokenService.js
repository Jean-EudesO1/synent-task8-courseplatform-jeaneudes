import { createHash, randomBytes } from 'node:crypto'
import AuthToken from '../models/AuthToken.js'

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueToken(userId, purpose, lifetimeMs) {
  const now = new Date()
  await AuthToken.updateMany(
    { userId, purpose, consumedAt: null },
    { $set: { consumedAt: now } },
  )

  const token = randomBytes(32).toString('base64url')
  await AuthToken.create({
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + lifetimeMs),
  })

  return token
}

export async function consumeToken(token, purpose) {
  const tokenHash = hashToken(token)
  const now = new Date()
  const consumed = await AuthToken.findOneAndUpdate(
    {
      tokenHash,
      purpose,
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
    { returnDocument: 'after' },
  )

  if (consumed) return consumed

  const existing = await AuthToken.findOne({ tokenHash, purpose })
  if (existing?.consumedAt) {
    const error = new Error('Ce lien a déjà été utilisé ou remplacé. Demandez un nouveau lien.')
    error.status = 400
    throw error
  }
  if (existing && existing.expiresAt <= now) {
    const error = new Error('Ce lien a expiré. Demandez un nouveau lien.')
    error.status = 400
    throw error
  }

  const error = new Error('Ce lien est invalide. Vérifiez le lien reçu ou demandez-en un nouveau.')
  error.status = 400
  throw error
}
