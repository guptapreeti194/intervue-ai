import { Outlet, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Practice from './pages/Practice'
import Report from './pages/Report'
import History from './pages/History'
import Settings from './pages/Settings'
import PlaceholderPage from './components/PlaceholderPage'

function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="app-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

function NotFound() {
  return (
    <PlaceholderPage
      eyebrow="404"
      title="This page doesn't exist"
      description="The link you followed may be broken, or the page may have moved. Head back home and try again."
      badge={false}
    />
  )
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/report" element={<Report />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  )
}