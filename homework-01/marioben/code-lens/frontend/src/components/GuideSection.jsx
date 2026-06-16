import { useState } from 'react'

export default function GuideSection() {
  const [open, setOpen] = useState(false)

  return (
    <div className="guide-section">
      <div className="guide-header" onClick={() => setOpen(o => !o)}>
        <div className="guide-header-left">
          <span className="guide-icon">⚗</span>
          <div>
            <div className="guide-title">What is CodeLens?</div>
            <div className="guide-subtitle">A playground for testing AI agents &amp; skills — click to learn more</div>
          </div>
        </div>
        <span className={`guide-chevron ${open ? 'open' : ''}`}>›</span>
      </div>

      {open && (
        <div className="guide-body">
          <div className="guide-alert">
            <span className="guide-alert-icon">⚠</span>
            <span>
              <strong>Mock project.</strong> This tool accepts two small snippets for simplicity. A production version
              would ingest entire project directories and produce deeper, more accurate analysis.
              The code review is powered by a <strong>free AI model</strong>, so results may be incomplete or imprecise.
            </span>
          </div>

          <div className="guide-purpose">
            <h3>Real purpose</h3>
            <p>
              CodeLens exists to let you <strong>experiment with Claude Code agents and skills</strong>.
              The idea is simple: ask an agent or skill to generate code, paste the output here, and
              use the AI review to sanity-check what was produced — or to compare two different
              agent-generated implementations side by side.
            </p>
          </div>

          <div className="guide-steps">
            <h3>How to use it</h3>
            <ol className="guide-ol">
              <li>
                <strong>Pick an agent or skill</strong> you want to test from the{' '}
                <a
                  href="https://github.com/affaan-m/ecc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="guide-link"
                >
                  ECC repository ↗
                </a>
                . The repo contains a large collection of subagents, skills, hooks, and slash commands
                ready to use with Claude Code.
              </li>
              <li>
                <strong>Generate code</strong> by prompting Claude Code with the agent or skill you
                chose. For example:
                <code className="guide-code-inline">/springboot-patterns</code> to scaffold a Spring Boot
                service, or{' '}
                <code className="guide-code-inline">subagent_type: java-reviewer</code> to get a review
                of existing code.
              </li>
              <li>
                <strong>Paste the output</strong> into the two editors below — Snippet 1 for a baseline
                implementation, Snippet 2 for the agent-generated version (or compare two different agents).
              </li>
              <li>
                <strong>Analyze</strong> and read the AI feedback to understand what the agent produced,
                where it excels, and where it falls short.
              </li>
            </ol>
          </div>

          <div className="guide-resources">
            <h3>Useful resources</h3>
            <div className="guide-resource-grid">
              <a
                href="https://github.com/affaan-m/ecc"
                target="_blank"
                rel="noopener noreferrer"
                className="guide-resource-card"
              >
                <span className="guide-resource-icon">⚙</span>
                <div>
                  <div className="guide-resource-name">ECC Repository</div>
                  <div className="guide-resource-desc">Subagents, skills, hooks &amp; slash commands for Claude Code</div>
                </div>
              </a>
              <div className="guide-resource-card static">
                <span className="guide-resource-icon">◈</span>
                <div>
                  <div className="guide-resource-name">Tip</div>
                  <div className="guide-resource-desc">Compare two agents on the same task to see which produces cleaner code</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}