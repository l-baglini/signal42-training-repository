import { lessons as a1Lessons } from './a1.js'
import { lessons as a2Lessons } from './a2.js'
import { lessons as b1Lessons } from './b1.js'
import { lessons as b2Lessons } from './b2.js'

export { a1Lessons, a2Lessons, b1Lessons, b2Lessons }

export const allLessons = [...a1Lessons, ...a2Lessons, ...b1Lessons, ...b2Lessons]

export const LEVELS = {
  A1: {
    id: 'a1',
    label: 'A1 – Beginner',
    description: 'Basic phrases and everyday expressions',
    color: '#10B981',
    bg: '#ECFDF5',
    lessons: a1Lessons,
  },
  A2: {
    id: 'a2',
    label: 'A2 – Elementary',
    description: 'Simple conversations on familiar topics',
    color: '#3B82F6',
    bg: '#EFF6FF',
    lessons: a2Lessons,
  },
  B1: {
    id: 'b1',
    label: 'B1 – Intermediate',
    description: 'Handle most situations while traveling',
    color: '#8B5CF6',
    bg: '#F5F3FF',
    lessons: b1Lessons,
  },
  B2: {
    id: 'b2',
    label: 'B2 – Upper Intermediate',
    description: 'Complex texts and fluent communication',
    color: '#EF4444',
    bg: '#FEF2F2',
    lessons: b2Lessons,
  },
}

export function getLessonById(id) {
  return allLessons.find((l) => l.id === id) || null
}
