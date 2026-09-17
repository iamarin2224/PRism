import { useState } from 'react'
import './App.css'

function App() {
  const [prompt, setPrompt] = useState('Explain what SQL injection is and how to prevent it.')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTest, setActiveTest] = useState(null)

  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'

  const handleHealthCheck = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setActiveTest('health')

    try {
      const res = await fetch(`${apiBaseUrl}/api/ai-health`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || data.error || `Error status ${res.status}`)
      }
      setResult(data)
    } catch (err) {
      setError(err.message || 'Failed to connect to backend')
    } finally {
      setLoading(false)
    }
  }

  const handleTestLLM = async () => {
    if (!prompt.trim()) {
      setError('Please provide a prompt.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setActiveTest('text')

    try {
      const res = await fetch(`${apiBaseUrl}/api/ai/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || data.error || `Error status ${res.status}`)
      }
      setResult(data)
    } catch (err) {
      setError(err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const handleTestStructured = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setActiveTest('structured')

    try {
      const res = await fetch(`${apiBaseUrl}/api/ai/test-structured`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || data.error || `Error status ${res.status}`)
      }
      setResult(data)
    } catch (err) {
      setError(err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
      case 'high':
        return '#ef4444'
      case 'medium':
        return '#f59e0b'
      case 'low':
        return '#10b981'
      default:
        return '#6b7280'
    }
  }

  return (
    <section id="center" style={{ padding: '40px 20px', maxWidth: '850px', margin: '0 auto' }}>
      <h1>PRism</h1>
      <p style={{ margin: '0 auto 24px', opacity: 0.85 }}>
        Agentic Pull Request Review System — Phase 1: LLM &amp; Structured Output Integration
      </p>

      {/* Prompt input area */}
      <div style={{ width: '100%', textAlign: 'left', marginBottom: '16px' }}>
        <label
          htmlFor="prompt-input"
          style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}
        >
          Test Prompt:
        </label>
        <textarea
          id="prompt-input"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a prompt to test OpenRouter LLM..."
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--code-bg)',
            color: 'var(--text-h)',
            fontFamily: 'inherit',
            fontSize: '15px',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '24px' }}>
        <button
          type="button"
          className="counter"
          onClick={handleTestLLM}
          disabled={loading}
          style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading && activeTest === 'text' ? 'Generating...' : 'Test LLM (Text)'}
        </button>

        <button
          type="button"
          className="counter"
          onClick={handleTestStructured}
          disabled={loading}
          style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading && activeTest === 'structured' ? 'Analyzing...' : 'Test Structured Output'}
        </button>

        <button
          type="button"
          className="counter"
          onClick={handleHealthCheck}
          disabled={loading}
          style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: 0.8 }}
        >
          {loading && activeTest === 'health' ? 'Checking...' : 'Check Health'}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '16px',
            borderRadius: '6px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#ef4444',
            marginBottom: '20px',
            boxSizing: 'border-box',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results Area */}
      {result && (
        <div
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '20px',
            borderRadius: '8px',
            backgroundColor: 'var(--social-bg)',
            border: '1px solid var(--border)',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '18px' }}>Output Result</h3>
            <span style={{ fontSize: '12px', opacity: 0.7 }}>Test: {activeTest}</span>
          </div>

          {/* If simple message / LLM text response */}
          {result.message && <p style={{ margin: 0 }}>{result.message}</p>}

          {result.response && (
            <div
              style={{
                whiteSpace: 'pre-wrap',
                lineHeight: '1.6',
                backgroundColor: 'var(--code-bg)',
                padding: '16px',
                borderRadius: '6px',
              }}
            >
              {result.response}
            </div>
          )}

          {/* If structured review findings */}
          {result.findings && (
            <div>
              <p style={{ marginBottom: '12px', fontSize: '14px', opacity: 0.8 }}>
                Found <strong>{result.findings.length}</strong> finding(s):
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {result.findings.map((f, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '14px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--code-bg)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: getSeverityColor(f.severity),
                          color: '#fff',
                        }}
                      >
                        {f.severity}
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {f.category}
                      </span>
                      {f.line !== null && f.line !== undefined && (
                        <span style={{ fontSize: '12px', opacity: 0.7 }}>Line: {f.line}</span>
                      )}
                      <strong style={{ marginLeft: '4px' }}>{f.title}</strong>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: '14px', lineHeight: '1.5' }}>
                      {f.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default App
