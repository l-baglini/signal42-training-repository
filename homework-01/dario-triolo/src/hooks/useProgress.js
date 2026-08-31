import { useState, useCallback } from 'react'
import { loadProgress, saveProgress, clearProgress } from '../utils/storage'

function buildSet(arr) {
  return new Set(Array.isArray(arr) ? arr : [])
}

function buildMap(obj) {
  return new Map(obj && typeof obj === 'object' ? Object.entries(obj) : [])
}

export default function useProgress() {
  const [progress, setProgress] = useState(() => loadProgress())

  const completedLessons = buildSet(progress.completedLessons)
  const exerciseResults = buildMap(progress.exerciseResults)

  const markComplete = useCallback((lessonId) => {
    setProgress((prev) => {
      if (prev.completedLessons.includes(lessonId)) return prev
      const next = {
        ...prev,
        completedLessons: [...prev.completedLessons, lessonId],
      }
      saveProgress(next)
      return next
    })
  }, [])

  const saveResult = useCallback((lessonId, correct, total) => {
    setProgress((prev) => {
      const updatedResults = {
        ...prev.exerciseResults,
        [lessonId]: {
          correct,
          total,
          completedAt: new Date().toISOString(),
        },
      }

      const shouldMarkComplete = correct >= Math.ceil(total / 2)
      const alreadyComplete = prev.completedLessons.includes(lessonId)
      const updatedCompleted =
        shouldMarkComplete && !alreadyComplete
          ? [...prev.completedLessons, lessonId]
          : prev.completedLessons

      const next = {
        completedLessons: updatedCompleted,
        exerciseResults: updatedResults,
      }
      saveProgress(next)
      return next
    })
  }, [])

  const getLevelProgress = useCallback(
    (levelId) => {
      const prefix = levelId + '-'
      const completed = progress.completedLessons.filter((id) => id.startsWith(prefix)).length
      const total = 10
      return {
        completed,
        total,
        pct: Math.round((completed / total) * 100),
      }
    },
    [progress.completedLessons]
  )

  const reset = useCallback(() => {
    clearProgress()
    setProgress({ completedLessons: [], exerciseResults: {} })
  }, [])

  return {
    completedLessons,
    exerciseResults,
    markComplete,
    saveResult,
    getLevelProgress,
    reset,
  }
}
