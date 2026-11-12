
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type Preferences = {
  displayName: string
  preferredRole: string
  difficulty: string
  showDemoData: boolean
}

const STORAGE_KEY = 'intervue-ai-settings-v1'

const defaultPreferences: Preferences = {
  displayName: '',
  preferredRole: 'Software Developer',
  difficulty: 'Medium',
  showDemoData: true,
}

export default function Settings() {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved
        ? { ...defaultPreferences, ...JSON.parse(saved) }
        : defaultPreferences
    } catch {
      return defaultPreferences
    }
  })

  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!message) return

    const timeout = window.setTimeout(() => setMessage(''), 3000)
    return () => window.clearTimeout(timeout)
  }, [message])

  function updatePreference<K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) {
    setPreferences((previous) => ({ ...previous, [key]: value }))
    setMessage('')
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
      setMessage('Your preferences have been saved in this browser.')
    } catch {
      setMessage('Could not save settings. Check your browser storage.')
    }
  }

  function resetSettings() {
    setPreferences(defaultPreferences)
    try {
      localStorage.removeItem(STORAGE_KEY)
      setMessage('Settings have been reset to their defaults.')
    } catch {
      setMessage('Settings were reset on screen, but browser storage could not be cleared.')
    }
  }

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Personal preferences</span>
          <h1>Settings</h1>
          <p>
            Customize your interview practice experience. Your settings are
            stored locally in this browser.
          </p>
        </div>

        <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{ marginBottom: 24 }}>Profile and preferences</h2>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="display-name"
              style={{ display: 'block', marginBottom: 8 }}
            >
              Display name
            </label>
            <input
              id="display-name"
              className="input"
              type="text"
              maxLength={60}
              placeholder="Enter your display name"
              value={preferences.displayName}
              onChange={(event) =>
                updatePreference('displayName', event.target.value)
              }
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="preferred-role"
              style={{ display: 'block', marginBottom: 8 }}
            >
              Preferred interview type
            </label>
            <select
              id="preferred-role"
              className="input"
              value={preferences.preferredRole}
              onChange={(event) =>
                updatePreference('preferredRole', event.target.value)
              }
              style={{ width: '100%' }}
            >
              <option>Software Developer</option>
              <option>HR / Behavioral</option>
              <option>Data Analyst</option>
            </select>
          </div>

          <div style={{ marginBottom: 28 }}>
            <label
              htmlFor="preferred-difficulty"
              style={{ display: 'block', marginBottom: 8 }}
            >
              Preferred difficulty
            </label>
            <select
              id="preferred-difficulty"
              className="input"
              value={preferences.difficulty}
              onChange={(event) =>
                updatePreference('difficulty', event.target.value)
              }
              style={{ width: '100%' }}
            >
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              marginBottom: 28,
            }}
          >
            <input
              id="show-demo-data"
              type="checkbox"
              checked={preferences.showDemoData}
              onChange={(event) =>
                updatePreference('showDemoData', event.target.checked)
              }
              style={{ marginTop: 5 }}
            />
            <label htmlFor="show-demo-data">
              <strong>Show demo data</strong>
              <p style={{ color: 'var(--text-dim)', marginTop: 6 }}>
                Keep illustrative scores and sample sessions visible while
                exploring the application.
              </p>
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <button
              className="btn btn-primary"
              type="button"
              onClick={saveSettings}
            >
              Save settings
            </button>

            <button
              className="btn btn-ghost"
              type="button"
              onClick={resetSettings}
            >
              Reset settings
            </button>
          </div>

          {message && (
            <p
              role="status"
              aria-live="polite"
              style={{ marginTop: 20 }}
            >
              {message}
            </p>
          )}
        </div>

        <div className="card" style={{ maxWidth: 760, margin: '24px auto 0' }}>
          <h2 style={{ marginBottom: 12 }}>Privacy and data</h2>
          <p style={{ color: 'var(--text-dim)', lineHeight: 1.8 }}>
            These preferences are saved in your current browser. This page
            does not upload your settings to a server. Other demo pages may
            use separate local storage keys, and resetting these settings
            does not erase their data.
          </p>

          <div style={{ marginTop: 20 }}>
            <Link className="btn btn-ghost" to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
