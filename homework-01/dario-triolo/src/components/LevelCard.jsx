import ProgressBar from './ProgressBar'

export default function LevelCard({
  level,
  title,
  description,
  totalLessons,
  completedLessons,
  color,
  bg,
  onClick,
}) {
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

  return (
    <div
      className="level-card"
      style={{ backgroundColor: bg, cursor: 'pointer' }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
    >
      <div className="level-card-header">
        <span className="level-badge" style={{ backgroundColor: color, color: '#fff' }}>
          {level}
        </span>
        <h2 className="level-card-title">{title}</h2>
      </div>

      <p className="level-card-description">{description}</p>

      <div className="level-card-progress">
        <ProgressBar value={pct} color={color} size="md" />
      </div>

      <div className="level-card-footer">
        <span className="level-card-lessons" style={{ color }}>
          {completedLessons} of {totalLessons} lessons
        </span>
        <span className="level-card-pct">{pct}%</span>
      </div>
    </div>
  )
}
