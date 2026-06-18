export default function ContentRenderer({ blocks }) {
  if (!blocks || blocks.length === 0) return null

  return (
    <div className="content-renderer">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'text':
            return (
              <p key={index} className="content-text">
                {block.text}
              </p>
            )

          case 'rule':
            return (
              <div key={index} className="content-rule">
                <div className="content-rule-title">{block.title}</div>
                <p>{block.text}</p>
              </div>
            )

          case 'table':
            return (
              <div key={index} style={{ overflowX: 'auto' }}>
                <table className="content-table">
                  <thead>
                    <tr>
                      {block.headers.map((header, hi) => (
                        <th key={hi}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )

          case 'examples':
            return (
              <ul key={index} className="content-examples">
                {block.items.map((item, ii) => (
                  <li key={ii} className="example-item">
                    <div>
                      <span className="example-es">{item.spanish}</span>
                      {item.note && <span className="example-note"> — {item.note}</span>}
                    </div>
                    <div className="example-en">{item.english}</div>
                  </li>
                ))}
              </ul>
            )

          case 'tip':
            return (
              <div key={index} className="content-tip">
                <span className="tip-icon">💡</span>
                {block.text}
              </div>
            )

          case 'warning':
            return (
              <div key={index} className="content-warning">
                <span className="tip-icon">⚠️</span>
                {block.text}
              </div>
            )

          default:
            return null
        }
      })}
    </div>
  )
}
