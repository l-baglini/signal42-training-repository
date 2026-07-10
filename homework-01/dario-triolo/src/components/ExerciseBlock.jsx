import { useState } from 'react'

const TYPE_LABELS = {
  'multiple-choice': 'Multiple Choice',
  'fill-blank': 'Fill in the Blank',
  translate: 'Translation',
}

// ---------------------------------------------------------------------------
// Multiple Choice
// ---------------------------------------------------------------------------
function MultipleChoice({ exercise, answered, selectedOption, onSelect }) {
  const { options, correct } = exercise

  return (
    <div className="mc-options">
      {options.map((option, index) => {
        let extraClass = ''
        if (answered) {
          if (index === correct) extraClass = ' mc-option--correct'
          else if (index === selectedOption) extraClass = ' mc-option--wrong'
        } else if (index === selectedOption) {
          extraClass = ' mc-option--selected'
        }

        return (
          <button
            key={index}
            className={`mc-option${extraClass}`}
            onClick={() => !answered && onSelect(index)}
            disabled={answered}
            type="button"
          >
            <span className="mc-option-marker">
              {answered && index === correct
                ? '✅'
                : answered && index === selectedOption
                ? '❌'
                : String.fromCharCode(65 + index)}
            </span>
            {option}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fill in the Blank
// ---------------------------------------------------------------------------
function FillBlank({ exercise, answered, inputValue, onInput, isCorrect }) {
  const parts = exercise.template.split('___')

  return (
    <div className="fill-blank">
      <p className="fill-blank-template">
        {parts[0]}
        <input
          className={`fill-blank-input${
            answered ? (isCorrect ? ' fill-blank-input--correct' : ' fill-blank-input--wrong') : ''
          }`}
          type="text"
          value={inputValue}
          onChange={(e) => !answered && onInput(e.target.value)}
          disabled={answered}
          aria-label="Fill in the blank"
        />
        {parts[1]}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Translate
// ---------------------------------------------------------------------------
function Translate({ exercise, answered, inputValue, onInput, isCorrect }) {
  const { source, direction } = exercise
  const label = direction === 'en-es' ? 'Translate to Spanish:' : 'Translate to English:'

  return (
    <div className="translate">
      <p className="translate-label">{label}</p>
      <p className="translate-source">{source}</p>
      <textarea
        className={`translate-input${
          answered ? (isCorrect ? ' translate-input--correct' : ' translate-input--wrong') : ''
        }`}
        value={inputValue}
        onChange={(e) => !answered && onInput(e.target.value)}
        disabled={answered}
        rows={3}
        placeholder="Type your translation here…"
        aria-label="Translation input"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExerciseBlock
// ---------------------------------------------------------------------------
export default function ExerciseBlock({ exercise, onAnswer }) {
  const [answered, setAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [selectedOption, setSelectedOption] = useState(null)
  const [inputValue, setInputValue] = useState('')

  const { type, question, explanation } = exercise

  const canSubmit = () => {
    if (answered) return false
    if (type === 'multiple-choice') return selectedOption !== null
    return inputValue.trim().length > 0
  }

  const handleSubmit = () => {
    if (!canSubmit()) return

    let correct = false

    if (type === 'multiple-choice') {
      correct = selectedOption === exercise.correct
    } else {
      // fill-blank and translate: case-insensitive, trimmed comparison
      correct = inputValue.trim().toLowerCase() === exercise.answer.trim().toLowerCase()
    }

    setIsCorrect(correct)
    setAnswered(true)
    onAnswer?.(correct)
  }

  const typeLabel = TYPE_LABELS[type] ?? type

  return (
    <div className="exercise-block">
      <div className="exercise-block-header">
        <span className="exercise-type-badge">{typeLabel}</span>
      </div>

      {question && <p className="exercise-question">{question}</p>}

      {type === 'multiple-choice' && (
        <MultipleChoice
          exercise={exercise}
          answered={answered}
          selectedOption={selectedOption}
          onSelect={setSelectedOption}
        />
      )}

      {type === 'fill-blank' && (
        <FillBlank
          exercise={exercise}
          answered={answered}
          inputValue={inputValue}
          onInput={setInputValue}
          isCorrect={isCorrect}
        />
      )}

      {type === 'translate' && (
        <Translate
          exercise={exercise}
          answered={answered}
          inputValue={inputValue}
          onInput={setInputValue}
          isCorrect={isCorrect}
        />
      )}

      {!answered && (
        <button
          className="exercise-submit-btn"
          onClick={handleSubmit}
          disabled={!canSubmit()}
          type="button"
        >
          Check Answer
        </button>
      )}

      {answered && (
        <div className={`exercise-feedback${isCorrect ? ' exercise-feedback--correct' : ' exercise-feedback--wrong'}`}>
          <span className="exercise-feedback-icon">{isCorrect ? '✅' : '❌'}</span>
          <p className="exercise-feedback-explanation">{explanation}</p>
        </div>
      )}
    </div>
  )
}
