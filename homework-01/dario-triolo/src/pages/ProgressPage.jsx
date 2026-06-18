import Navbar from '../components/Navbar.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import { LEVELS } from '../data/index.js'
import useProgress from '../hooks/useProgress.js'

const LEVEL_KEYS = ['A1', 'A2', 'B1', 'B2']
// Average minutes per lesson across all levels
const MINS_PER_LESSON = 20

export default function ProgressPage() {
  const { completedLessons, exerciseResults, getLevelProgress, reset } = useProgress()

  // ── Global stats ────────────────────────────────────────────────────────────
  const totalCompleted = LEVEL_KEYS.reduce((acc, key) => {
    return acc + getLevelProgress(LEVELS[key].id).completed
  }, 0)

  const totalPerfect = Array.from(exerciseResults.values()).filter(
    (r) => r.correct === r.total
  ).length

  const studyMinutes = totalCompleted * MINS_PER_LESSON

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all your progress? This cannot be undone.')) {
      reset()
    }
  }

  return (
    <div className="page">
      <Navbar />

      <div className="progress-page">
        <h1 className="progress-page-title">Mi Progreso</h1>

        {/* ── Stat cards ──────────────────────────────────────────────────── */}
        <div className="stat-cards">
          <div className="stat-card">
            <span className="stat-card-value">{totalCompleted}</span>
            <span className="stat-card-label">Lessons Completed</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value">{totalPerfect}</span>
            <span className="stat-card-label">Perfect Scores</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value">🔥</span>
            <span className="stat-card-label">Current Streak</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value">~{studyMinutes} min</span>
            <span className="stat-card-label">Total Study Time</span>
          </div>
        </div>

        {/* ── Per-level breakdown ─────────────────────────────────────────── */}
        <div className="progress-levels">
          {LEVEL_KEYS.map((key) => {
            const level = LEVELS[key]
            const { completed, total, pct } = getLevelProgress(level.id)

            const completedTitles = level.lessons
              .filter((l) => completedLessons.has(l.id))
              .map((l) => ({ id: l.id, title: l.title, icon: l.icon }))

            return (
              <div key={key} className="progress-level-section">
                <div className="progress-level-header">
                  <span
                    className="level-badge"
                    style={{ backgroundColor: level.color, color: '#fff' }}
                  >
                    {key}
                  </span>
                  <span className="progress-level-name">{level.label}</span>
                  <span className="progress-level-count">
                    {completed} / {total}
                  </span>
                </div>

                <ProgressBar value={pct} color={level.color} size="md" />

                {completedTitles.length > 0 && (
                  <ul className="progress-completed-list">
                    {completedTitles.map((l) => (
                      <li key={l.id} className="progress-completed-item">
                        <span className="progress-completed-icon">{l.icon}</span>
                        <span className="progress-completed-title">{l.title}</span>
                        <span className="progress-completed-check">✅</span>
                      </li>
                    ))}
                  </ul>
                )}

                {completedTitles.length === 0 && (
                  <p className="progress-empty">No lessons completed yet — start learning!</p>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Reset button ────────────────────────────────────────────────── */}
        <div className="progress-reset-wrap">
          <button className="btn btn-danger" onClick={handleReset}>
            Reset Progress
          </button>
        </div>
      </div>
    </div>
  )
}
