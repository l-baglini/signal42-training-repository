const STORAGE_KEY = 'espanol_flow_progress'

const DEFAULT_PROGRESS = {
  completedLessons: [],
  exerciseResults: {},
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PROGRESS, exerciseResults: {} }
    const parsed = JSON.parse(raw)
    return {
      completedLessons: Array.isArray(parsed.completedLessons) ? parsed.completedLessons : [],
      exerciseResults: parsed.exerciseResults && typeof parsed.exerciseResults === 'object' ? parsed.exerciseResults : {},
    }
  } catch {
    return { ...DEFAULT_PROGRESS, exerciseResults: {} }
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Silently fail if localStorage is unavailable (e.g. private browsing quota exceeded)
  }
}

export function clearProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Silently fail
  }
}
