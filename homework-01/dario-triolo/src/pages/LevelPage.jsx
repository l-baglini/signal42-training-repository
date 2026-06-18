import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import LessonCard from '../components/LessonCard.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import { LEVELS } from '../data/index.js'
import useProgress from '../hooks/useProgress.js'

export default function LevelPage() {
  const { levelId } = useParams()
  const navigate = useNavigate()
  const { completedLessons, exerciseResults, getLevelProgress } = useProgress()

  const levelKey = levelId ? levelId.toUpperCase() : ''
  const level = LEVELS[levelKey]

  if (!level) {
    return (
      <div className="page">
        <Navbar />
        <div className="not-found">
          <h2>Level not found</h2>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  const { completed, total, pct } = getLevelProgress(level.id)

  return (
    <div className="page">
      <Navbar />

      <div className="level-page-header">
        <button
          className="back-btn"
          onClick={() => navigate('/')}
          aria-label="Back to home"
        >
          ← Back
        </button>

        <div className="level-page-meta">
          <span className="level-badge" style={{ backgroundColor: level.color, color: '#fff' }}>
            {levelKey}
          </span>
          <h1 className="level-page-title">{level.label}</h1>
          <p className="level-page-description">{level.description}</p>
        </div>

        <div className="level-page-progress">
          <div className="level-page-progress-label">
            <span>{completed} of {total} lessons completed</span>
            <span>{pct}%</span>
          </div>
          <ProgressBar value={pct} color={level.color} size="lg" />
        </div>
      </div>

      <div className="lesson-list">
        {level.lessons.map((lesson) => {
          const isCompleted = completedLessons.has(lesson.id)
          const resultEntry = exerciseResults.get(lesson.id)
          const score = resultEntry
            ? { correct: resultEntry.correct, total: resultEntry.total }
            : null

          return (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              isCompleted={isCompleted}
              score={score}
              onClick={() => navigate(`/lesson/${lesson.id}`)}
            />
          )
        })}
      </div>
    </div>
  )
}
