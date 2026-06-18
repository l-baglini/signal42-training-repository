import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import LevelCard from '../components/LevelCard.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import { LEVELS } from '../data/index.js'
import useProgress from '../hooks/useProgress.js'

const LEVEL_KEYS = ['A1', 'A2', 'B1', 'B2']
const TOTAL_LESSONS = 40

export default function Home() {
  const navigate = useNavigate()
  const { getLevelProgress } = useProgress()

  const totalCompleted = LEVEL_KEYS.reduce((acc, key) => {
    const levelId = LEVELS[key].id
    return acc + getLevelProgress(levelId).completed
  }, 0)

  const overallPct = Math.round((totalCompleted / TOTAL_LESSONS) * 100)

  return (
    <div className="page">
      <Navbar />

      <div className="hero">
        <h1 className="hero-title">¡Aprende Español!</h1>
        <p className="hero-subtitle">
          Master Spanish at your own pace — from beginner phrases to fluent communication.
        </p>

        <div className="hero-stats">
          <div className="hero-stats-label">
            <span>Overall Progress</span>
            <span className="hero-stats-count">
              {totalCompleted} / {TOTAL_LESSONS} lessons
            </span>
          </div>
          <ProgressBar value={overallPct} color="#C60B1E" size="md" />
        </div>
      </div>

      <div className="level-grid">
        {LEVEL_KEYS.map((key) => {
          const level = LEVELS[key]
          const { completed, total } = getLevelProgress(level.id)

          return (
            <LevelCard
              key={key}
              level={key}
              title={level.label}
              description={level.description}
              totalLessons={total}
              completedLessons={completed}
              color={level.color}
              bg={level.bg}
              onClick={() => navigate(`/level/${level.id}`)}
            />
          )
        })}
      </div>
    </div>
  )
}
