export default function LessonCard({ lesson, isCompleted, score, onClick }) {
  const { icon, title, description, estimatedTime } = lesson

  return (
    <div
      className={`lesson-card${isCompleted ? ' completed' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
    >
      <div className="lesson-card-left">
        <div className="lesson-card-icon">{icon}</div>
        <div className="lesson-card-info">
          <h3 className="lesson-card-title">{title}</h3>
          <p className="lesson-card-description">{description}</p>
          <span className="lesson-card-meta">{estimatedTime}</span>
        </div>
      </div>

      <div className="lesson-card-right">
        {score != null && (
          <span className="lesson-card-score">
            {score.correct}/{score.total}
          </span>
        )}
        {isCompleted && (
          <span className="lesson-card-check" aria-label="Completed">
            ✅
          </span>
        )}
      </div>
    </div>
  )
}
