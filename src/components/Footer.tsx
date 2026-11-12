import { Link } from 'react-router-dom'
import Logo from './Logo'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo />
            <p>
              An AI-powered interview performance analyzer. This is a college minor
              project, currently running on local demo data.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <div className="footer-links">
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/practice">Practice interview</Link>
              <Link to="/report">Analysis report</Link>
            </div>
          </div>
          <div>
            <h4>Account</h4>
            <div className="footer-links">
              <Link to="/history">Interview history</Link>
              <Link to="/settings">Settings</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} InterVue AI. Minor project.</span>
          <span>All scores shown are simulated demo results.</span>
        </div>
      </div>
    </footer>
  )
}