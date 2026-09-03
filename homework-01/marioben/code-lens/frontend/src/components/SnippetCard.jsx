import ScoreBar from './ScoreBar.jsx'

const CRITERIA = [
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'security', label: 'Security' },
  { key: 'readability', label: 'Readability' },
  { key: 'designPatterns', label: 'Design Patterns' },
]

function scoreColor(score) {
  if (score <= 4) return '#ef4444'
  if (score <= 6) return '#f97316'
  if (score <= 8) return '#6366f1'
  return '#22c55e'
}

export default function SnippetCard({ title, review, isWinner }) {
  if (!review) return null

  return (
    <div className={`snippet-card${isWinner ? ' is-winner' : ''}`}>
      <div className="card-header">
        <span className="card-title">
          {isWinner && <span className="winner-crown">👑</span>}
          {title}
        </span>
        <span
          className="overall-badge"
          style={{ background: scoreColor(review.overallScore) }}
        >
          {review.overallScore}
        </span>
      </div>

      <div className="card-body">
        {CRITERIA.map(({ key, label }) => {
          const criterion = review[key]
          if (!criterion) return null
          return (
            <div key={key} className="criterion">
              <div className="criterion-header">
                <span className="criterion-name">{label}</span>
                <span className="criterion-score">{criterion.score}/10</span>
              </div>
              <ScoreBar score={criterion.score} />
              {criterion.observations && (
                <p className="criterion-observations">{criterion.observations}</p>
              )}
              {criterion.suggestions?.length > 0 && (
                <ul className="criterion-suggestions">
                  {criterion.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}

        {review.summary && (
          <div className="card-summary">{review.summary}</div>
        )}
      </div>
    </div>
  )
}
