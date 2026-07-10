export default function CodeEditor({ label, dotClass, value, onChange }) {
  return (
    <div className="code-editor">
      <div className="editor-header">
        <span className="editor-label">
          <span className={dotClass} />
          {label}
        </span>
        <span className="char-count">{value.length} chars</span>
      </div>
      <textarea
        className="code-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Paste your code here…"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  )
}
