const SIZE_MAP = {
  sm: '6px',
  md: '10px',
  lg: '14px',
}

export default function ProgressBar({ value = 0, color = '#C60B1E', size = 'md' }) {
  const clampedValue = Math.min(100, Math.max(0, value))
  const height = SIZE_MAP[size] ?? SIZE_MAP.md

  return (
    <div className="progress-bar-wrap" role="progressbar" aria-valuenow={clampedValue} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="progress-bar-fill"
        style={{
          width: `${clampedValue}%`,
          backgroundColor: color,
          height,
        }}
      />
    </div>
  )
}
