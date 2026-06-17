import SnippetCard from './SnippetCard.jsx'

export default function ReviewResults({ result }) {
  const { snippet1, snippet2, comparison, winner } = result

  const isTie = winner === 'tie'
  const winnerLabel = isTie
    ? 'It\'s a Tie!'
    : winner === 'snippet1'
    ? 'Snippet 1 Wins'
    : 'Snippet 2 Wins'

  const winnerSubtitle = isTie
    ? 'Both snippets are equally matched.'
    : `${winnerLabel} with a higher overall quality score.`

  return (
    <div>
      <div className={`winner-banner${isTie ? ' tie' : ''}`}>
        <h2>{winnerLabel}</h2>
        <p>{winnerSubtitle}</p>
      </div>

      <div className="results-grid">
        <SnippetCard
          title="Snippet 1"
          review={snippet1}
          isWinner={winner === 'snippet1'}
        />
        <SnippetCard
          title="Snippet 2"
          review={snippet2}
          isWinner={winner === 'snippet2'}
        />
      </div>

      {comparison && (
        <div className="comparison-section">
          <h3>
            <span>◈</span>
            Comparison
          </h3>
          <p className="comparison-text">{comparison}</p>
        </div>
      )}
    </div>
  )
}
