export default function ScoreBar({ score }) {
  const pct = (score / 10) * 100

  let color
  if (score <= 4) color = '#ef4444'
  else if (score <= 6) color = '#f97316'
  else if (score <= 8) color = '#6366f1'
  else color = '#22c55e'

  return (
    <div className="score-bar-track">
      <div
        className="score-bar-fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}
