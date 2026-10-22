import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import Logo from './Logo'
import Button from './Button'

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/dashboard', label: 'Dashboard', end: false },
  { to: '/practice', label: 'Practice', end: false },
  { to: '/report', label: 'Report', end: false },
  { to: '/history', label: 'History', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <header className="navbar">
      <div className="container nav-inner">
        <Logo onClick={close} />

        <nav
          id="primary-nav"
          className={`nav-links${open ? ' open' : ''}`}
          aria-label="Primary"
        >
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={close}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
          <Button to="/practice" size="sm" className="mobile-only" onClick={close}>
            Start practicing
          </Button>
        </nav>

        <div className="nav-cta">
          <Button to="/practice" size="sm">
            Start practicing
          </Button>
          <button
            type="button"
            className="nav-toggle"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="primary-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              {open ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}