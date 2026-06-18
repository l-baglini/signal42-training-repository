import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import ContentRenderer from '../components/ContentRenderer.jsx'
import ExerciseBlock from '../components/ExerciseBlock.jsx'
import { getLessonById, LEVELS } from '../data/index.js'
import useProgress from '../hooks/useProgress.js'

function getEncouragingMessage(correct, total) {
  if (correct === total) return '¡Perfecto!'
  if (correct >= total - 1) return '¡Muy bien!'
  if (correct >= Math.ceil(total / 2)) return '¡Bien!'
  return 'Keep practicing!'
}

function getLevelForLesson(lesson) {
  if (!lesson) return null
  const levelKey = lesson.level
  return LEVELS[levelKey] || null
}

function getNextLesson(lesson) {
  if (!lesson) return null
  const level = getLevelForLesson(lesson)
  if (!level) return null
  const idx = level.lessons.findIndex((l) => l.id === lesson.id)
  if (idx === -1 || idx === level.lessons.length - 1) return null
  return level.lessons[idx + 1]
}

export default function LessonPage() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const { saveResult } = useProgress()

  const lesson = getLessonById(lessonId)

  const [phase, setPhase] = useState('learn')
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [results, setResults] = useState([])
  // Track whether the current exercise has been answered before allowing "Next"
  const [currentAnswered, setCurrentAnswered] = useState(false)
  // Final score stored once practice completes
  const [finalScore, setFinalScore] = useState(null)
  const savedRef = useRef(false)

  if (!lesson) {
    return (
      <div className="page">
        <Navbar />
        <div className="not-found">
          <h2>Lesson not found</h2>
          <button className="btn btn-primary" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const exercises = lesson.exercises || []
  const levelId = lesson.level.toLowerCase()
  const nextLesson = getNextLesson(lesson)

  const handleAnswer = (isCorrect) => {
    setResults((prev) => [...prev, isCorrect])
    setCurrentAnswered(true)
  }

  const handleNext = () => {
    const nextIndex = exerciseIndex + 1
    if (nextIndex < exercises.length) {
      setExerciseIndex(nextIndex)
      setCurrentAnswered(false)
    } else {
      // All exercises done — tally and complete
      const allResults = [...results]
      const correct = allResults.filter(Boolean).length
      const total = exercises.length

      if (!savedRef.current) {
        saveResult(lesson.id, correct, total)
        savedRef.current = true
      }

      setFinalScore({ correct, total })
      setPhase('complete')
    }
  }

  // ── Learn Phase ────────────────────────────────────────────────────────────
  if (phase === 'learn') {
    return (
      <div className="page">
        <Navbar />

        <div className="lesson-sticky-header">
          <button className="back-btn" onClick={() => navigate(`/level/${levelId}`)}>
            ← Back
          </button>
          <h1 className="lesson-sticky-title">
            {lesson.icon} {lesson.title}
          </h1>
          <button
            className="btn btn-primary"
            onClick={() => {
              setPhase('practice')
              setExerciseIndex(0)
              setResults([])
              setCurrentAnswered(false)
              savedRef.current = false
            }}
          >
            Start Practice →
          </button>
        </div>

        <div className="lesson-content">
          <ContentRenderer blocks={lesson.content} />
        </div>
      </div>
    )
  }

  // ── Practice Phase ─────────────────────────────────────────────────────────
  if (phase === 'practice') {
    const exercise = exercises[exerciseIndex]
    const totalExercises = exercises.length

    return (
      <div className="page">
        <Navbar />

        <div className="practice-header">
          <button className="back-btn" onClick={() => setPhase('learn')}>
            ← Back to Lesson
          </button>
          <span className="practice-progress-label">
            Exercise {exerciseIndex + 1} of {totalExercises}
          </span>
        </div>

        <div className="practice-content">
          <ExerciseBlock
            key={exercise.id}
            exercise={exercise}
            onAnswer={handleAnswer}
          />

          {currentAnswered && (
            <div className="practice-next-wrap">
              <button className="btn btn-primary" onClick={handleNext}>
                {exerciseIndex + 1 < totalExercises ? 'Next Exercise →' : 'See Results →'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Complete Phase ─────────────────────────────────────────────────────────
  const { correct, total } = finalScore || { correct: 0, total: exercises.length }
  const message = getEncouragingMessage(correct, total)

  return (
    <div className="page">
      <Navbar />

      <div className="lesson-complete-card">
        <div className="lesson-complete-trophy">🏆</div>
        <h2 className="lesson-complete-title">Lesson Complete!</h2>
        <p className="lesson-complete-score">
          {correct} / {total}
        </p>
        <p className="lesson-complete-message">{message}</p>

        <div className="lesson-complete-actions">
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/level/${levelId}`)}
          >
            Back to Level
          </button>

          {nextLesson && (
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/lesson/${nextLesson.id}`)}
            >
              Next Lesson →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
