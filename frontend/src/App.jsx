import { useState } from 'react'
import './App.css'

function App() {
  const [responseMessage, setResponseMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'

  const checkAiService = async () => {
    setLoading(true)
    setError(null)
    setResponseMessage('')

    try {
      const res = await fetch(`${apiBaseUrl}/api/ai-health`)
      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`)
      }
      const data = await res.json()
      setResponseMessage(data.message || JSON.stringify(data))
    } catch (err) {
      setError(err.message || 'Failed to connect to backend')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="center" style={{ padding: '40px 20px' }}>
      <h1>PRism</h1>
      <p style={{ maxWidth: '600px', margin: '0 auto 24px' }}>
        Agentic Pull Request Review System — Phase 0 Integration
      </p>

      <div style={{ margin: '20px 0' }}>
        <button
          type="button"
          className="counter"
          onClick={checkAiService}
          disabled={loading}
          style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Checking...' : 'Check AI Service'}
        </button>
      </div>

      {responseMessage && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px 20px',
            borderRadius: '6px',
            backgroundColor: 'var(--accent-bg)',
            border: '1px solid var(--accent-border)',
            color: 'var(--text-h)',
          }}
        >
          <strong>Response:</strong> {responseMessage}
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px 20px',
            borderRadius: '6px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#ef4444',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}
    </section>
  )
}

export default App
