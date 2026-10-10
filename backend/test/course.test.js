import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import mongoose from 'mongoose'

const [{ default: app }, { default: Course }] = await Promise.all([
  import('../src/app.js'),
  import('../src/models/Course.js'),
])

const suffix = randomUUID()
const slugPrefix = `catalog-test-${suffix}`
const courses = [
  {
    slug: `${slugPrefix}-alpha`,
    title: `Alpha course ${suffix}`,
    description: 'A course about JavaScript search behavior.',
    category: `Category ${suffix}`,
    level: 'Débutant',
    price: 12500,
    currency: 'INR',
    status: 'published',
    modules: [{
      title: 'Public module',
      lessons: [{
        title: 'Public lesson',
        durationMinutes: 12,
        videoUrl: 'https://private.invalid/video',
        content: 'Private lesson content',
      }],
    }],
  },
  {
    slug: `${slugPrefix}-beta`,
    title: `Beta course ${suffix}`,
    description: 'A course about APIs.',
    category: `Category ${suffix}`,
    level: 'Intermédiaire',
    price: 25000,
    currency: 'INR',
    status: 'published',
    modules: [],
  },
  {
    slug: `${slugPrefix}-gamma`,
    title: `Gamma course ${suffix}`,
    description: 'A course about databases.',
    category: `Other ${suffix}`,
    level: 'Avancé',
    price: 37500,
    currency: 'INR',
    status: 'published',
    modules: [],
  },
  {
    slug: `${slugPrefix}-draft`,
    title: `Hidden course ${suffix}`,
    description: 'This course is not published.',
    category: `Category ${suffix}`,
    level: 'Débutant',
    price: 100,
    currency: 'INR',
    status: 'draft',
    modules: [],
  },
]

const server = app.listen(0)
const baseUrl = await new Promise((resolve) => {
  server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`))
})

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`)
  return { response, data: await response.json() }
}

before(async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI doit être configurée localement pour les tests d’intégration.')
  }
  await mongoose.connect(process.env.MONGODB_URI)
  await Course.insertMany(courses)
})

after(async () => {
  await Course.deleteMany({ slug: { $regex: `^${slugPrefix}-` } })
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  await mongoose.disconnect()
})

test('recherche, filtres, pagination et métadonnées publiques du catalogue', async () => {
  const search = await get(`/api/courses?q=${encodeURIComponent(`Alpha course ${suffix}`)}`)
  assert.equal(search.response.status, 200)
  assert.equal(search.data.courses.length, 1)
  assert.equal(search.data.courses[0].title, courses[0].title)
  assert.equal(JSON.stringify(search.data).includes('private.invalid'), false)
  assert.equal(JSON.stringify(search.data).includes('Private lesson content'), false)

  const unpublishedSearch = await get(`/api/courses?q=${encodeURIComponent(`Hidden course ${suffix}`)}`)
  assert.equal(unpublishedSearch.response.status, 200)
  assert.deepEqual(unpublishedSearch.data.courses, [])

  const category = await get(`/api/courses?category=${encodeURIComponent(courses[0].category)}`)
  assert.equal(category.data.courses.length, 2)
  assert.ok(category.data.categories.includes(courses[0].category))

  const level = await get('/api/courses?level=Avanc%C3%A9')
  assert.ok(level.data.courses.every((course) => course.level === 'Avancé'))
  assert.ok(level.data.courses.every((course) => !course.title.startsWith(`Hidden course ${suffix}`)))

  const page = await get('/api/courses?limit=1&page=2')
  assert.equal(page.data.courses.length, 1)
  assert.equal(page.data.pagination.page, 2)
  assert.equal(page.data.pagination.limit, 1)
  assert.ok(page.data.pagination.total >= 3)
  assert.equal(page.data.pagination.pages, page.data.pagination.total)

  const invalidQuery = await get('/api/courses?limit=51')
  assert.equal(invalidQuery.response.status, 400)
})

test('détails publiés exposés sans URL vidéo ni contenu privé', async () => {
  const stored = await Course.findOne({ slug: courses[0].slug })
  const details = await get(`/api/courses/${stored.id}`)
  assert.equal(details.response.status, 200)
  assert.equal(details.data.course.title, courses[0].title)
  assert.deepEqual(details.data.course.modules, [{
    title: 'Public module',
    lessons: [{ title: 'Public lesson', durationMinutes: 12 }],
  }])
  assert.equal(JSON.stringify(details.data).includes('private.invalid'), false)
  assert.equal(JSON.stringify(details.data).includes('Private lesson content'), false)

  const draft = await Course.findOne({ slug: courses[3].slug })
  const hidden = await get(`/api/courses/${draft.id}`)
  assert.equal(hidden.response.status, 404)

  const invalidId = await get('/api/courses/not-an-object-id')
  assert.equal(invalidId.response.status, 400)
})
