import { useState } from 'react'
import './App.css'
import CodeEditor from './components/CodeEditor.jsx'
import ReviewResults from './components/ReviewResults.jsx'
import GuideSection from './components/GuideSection.jsx'

const API_URL = 'http://localhost:8080/api/review'

const LANGUAGES = [
  { value: '', label: 'Auto-detect' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'sql', label: 'SQL' },
]

export default function App() {
  const [snippet1, setSnippet1] = useState('')
  const [snippet2, setSnippet2] = useState('')
  const [language, setLanguage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const canSubmit = snippet1.trim().length > 0 && snippet2.trim().length > 0 && !loading

  async function handleAnalyze() {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snippet1, snippet2, language }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Server error (${res.status})`)
      }

      const data = await res.json()
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-badge">
          <span>✦</span>
          AI-Powered
        </div>
        <h1>CodeLens</h1>
        <p>Paste two code snippets and get an expert AI review across cleanliness, security, readability, and design patterns.</p>
      </header>

      <GuideSection />

      <div className="controls">
        <label htmlFor="lang-select">Language:</label>
        <select
          id="lang-select"
          className="lang-select"
          value={language}
          onChange={e => setLanguage(e.target.value)}
        >
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      <div className="editor-grid">
        <CodeEditor
          label="Snippet 1"
          dotClass="editor-label-dot"
          value={snippet1}
          onChange={setSnippet1}
        />
        <CodeEditor
          label="Snippet 2"
          dotClass="editor-label-dot dot-2"
          value={snippet2}
          onChange={setSnippet2}
        />
      </div>

      <div className="btn-row">
        <button
          className="analyze-btn"
          onClick={handleAnalyze}
          disabled={!canSubmit}
        >
          {loading ? (
            <>
              <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
              Analyzing…
            </>
          ) : (
            <>
              <span>✦</span>
              Analyze Code
            </>
          )}
        </button>
      </div>

      {loading && (
        <div className="spinner-wrap">
          <div className="spinner" />
          <span>The AI is reviewing your code…</span>
        </div>
      )}

      {error && (
        <div className="error-box">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {result && <ReviewResults result={result} />}
    </div>
  )
}
