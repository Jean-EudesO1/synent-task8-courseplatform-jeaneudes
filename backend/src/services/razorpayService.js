import { createHmac, timingSafeEqual } from 'node:crypto'

let testClient

function credentials() {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = process.env
  if (!keyId || !keySecret) {
    const error = new Error('Le paiement Razorpay est indisponible : configurez RAZORPAY_KEY_ID et RAZORPAY_KEY_SECRET dans backend/.env.')
    error.status = 503
    throw error
  }
  if (!keyId.startsWith('rzp_test_')) {
    const error = new Error('Seules les clés de test Razorpay (préfixe rzp_test_) sont acceptées par cette application.')
    error.status = 503
    throw error
  }
  return { keyId, keySecret }
}

async function razorpayRequest(path, { method = 'GET', body, keyId, keySecret }) {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  let data
  try {
    data = await response.json()
  } catch {
    const error = new Error('Réponse invalide du service de paiement. Réessayez plus tard.')
    error.status = 502
    throw error
  }
  if (!response.ok) {
    const error = new Error('Le service Razorpay a refusé la demande. Vérifiez les clés et réessayez.')
    error.status = response.status >= 500 ? 502 : 400
    throw error
  }
  return data
}

export async function createRazorpayOrder({ amount, currency, receipt, notes }) {
  const config = credentials()
  const order = testClient
    ? await testClient.createOrder({ amount, currency, receipt, notes })
    : await razorpayRequest('/orders', {
      method: 'POST',
      body: { amount, currency, receipt, notes },
      ...config,
    })
  return { order, keyId: config.keyId }
}

export async function fetchRazorpayPayment(paymentId) {
  const config = credentials()
  if (testClient) return testClient.fetchPayment(paymentId)
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, config)
}

export function verifyRazorpaySignature(orderId, paymentId, signature) {
  const { keySecret } = credentials()
  if (typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature)) return false
  const expected = createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest()
  const received = Buffer.from(signature, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

export function getRazorpayKeyId() {
  return credentials().keyId
}

export function setRazorpayTestClient(client) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Le client factice Razorpay est réservé aux tests.')
  }
  testClient = client
}
