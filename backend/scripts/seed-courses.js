import 'dotenv/config'
import mongoose from 'mongoose'
import Course from '../src/models/Course.js'

const placeholderImage = '/courses/course-placeholder.svg'
const demoCourses = [
  {
    slug: 'javascript-fondamentaux-demo',
    title: 'JavaScript : les fondamentaux',
    description: 'Apprenez les bases du langage JavaScript, des variables aux fonctions, et construisez des interactions web solides.',
    category: 'Développement web',
    level: 'Débutant',
    image: placeholderImage,
    price: 49900,
    currency: 'INR',
    status: 'published',
    modules: [
      {
        title: 'Découvrir JavaScript',
        lessons: [
          { title: 'Présentation du langage', durationMinutes: 12 },
          { title: 'Variables et types de données', durationMinutes: 24 },
          { title: 'Opérateurs et expressions', durationMinutes: 18 },
        ],
      },
      {
        title: 'Structurer son code',
        lessons: [
          { title: 'Conditions et boucles', durationMinutes: 28 },
          { title: 'Fonctions réutilisables', durationMinutes: 32 },
        ],
      },
    ],
  },
  {
    slug: 'react-interfaces-modernes-demo',
    title: 'React : interfaces modernes',
    description: 'Créez des interfaces React réactives avec des composants, des propriétés, des hooks et une navigation simple.',
    category: 'Développement web',
    level: 'Intermédiaire',
    image: placeholderImage,
    price: 79900,
    currency: 'INR',
    status: 'published',
    modules: [
      {
        title: 'Composants React',
        lessons: [
          { title: 'Votre première application', durationMinutes: 20 },
          { title: 'Propriétés et composition', durationMinutes: 26 },
        ],
      },
      {
        title: 'État et navigation',
        lessons: [
          { title: 'Gérer l’état avec les hooks', durationMinutes: 34 },
          { title: 'Construire une navigation', durationMinutes: 30 },
        ],
      },
    ],
  },
  {
    slug: 'mongodb-modelisation-demo',
    title: 'MongoDB : modélisation des données',
    description: 'Comprenez les documents, les collections, les index et les principes de modélisation avec MongoDB.',
    category: 'Bases de données',
    level: 'Débutant',
    image: placeholderImage,
    price: 59900,
    currency: 'INR',
    status: 'published',
    modules: [
      {
        title: 'Premiers pas avec MongoDB',
        lessons: [
          { title: 'Documents et collections', durationMinutes: 17 },
          { title: 'Requêtes essentielles', durationMinutes: 25 },
        ],
      },
      {
        title: 'Concevoir un modèle',
        lessons: [
          { title: 'Relations et références', durationMinutes: 29 },
          { title: 'Index et performances', durationMinutes: 22 },
        ],
      },
    ],
  },
  {
    slug: 'api-node-express-demo',
    title: 'Créer une API avec Node.js et Express',
    description: 'Construisez une API REST avec Express, des routes organisées, une validation et une gestion claire des erreurs.',
    category: 'Développement backend',
    level: 'Avancé',
    image: placeholderImage,
    price: 99900,
    currency: 'INR',
    status: 'published',
    modules: [
      {
        title: 'Routes et middleware',
        lessons: [
          { title: 'Organiser les routes Express', durationMinutes: 27 },
          { title: 'Créer un middleware réutilisable', durationMinutes: 31 },
        ],
      },
      {
        title: 'Fiabiliser une API',
        lessons: [
          { title: 'Valider les requêtes', durationMinutes: 25 },
          { title: 'Gérer les erreurs HTTP', durationMinutes: 23 },
        ],
      },
    ],
  },
]

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI est nécessaire pour ajouter les cours de démonstration.')
}

try {
  await mongoose.connect(process.env.MONGODB_URI)
  let inserted = 0

  for (const course of demoCourses) {
    const result = await Course.updateOne(
      { slug: course.slug },
      { $setOnInsert: course },
      { upsert: true, runValidators: true },
    )
    if (result.upsertedCount) inserted += 1
  }

  console.log(`${inserted} cours de démonstration ajouté(s) ; les cours existants ont été conservés.`)
} catch (error) {
  console.error('Échec de l’ajout des cours de démonstration :', error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
