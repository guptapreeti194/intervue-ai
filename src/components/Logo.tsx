import { Link } from 'react-router-dom'

type LogoProps = {
  onClick?: () => void
}

export default function Logo({ onClick }: LogoProps) {
  return (
    <Link to="/" className="logo" onClick={onClick} aria-label="InterVue AI home">
      <svg className="logo-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#logo-grad)" />
        <path
          d="M6 16h3m3-6v12m4-9v6m4-9v12m4-6h3"
          stroke="#060a18"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      <span>
        InterVue <b>AI</b>
      </span>
    </Link>
  )
}