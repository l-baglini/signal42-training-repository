import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const location = useLocation()

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">
          <span className="flag">🇪🇸</span>
          <span>EspañolFlow</span>
        </Link>
        <ul className="navbar-nav">
          <li>
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
              Home
            </Link>
          </li>
          <li>
            <Link to="/progress" className={location.pathname === '/progress' ? 'active' : ''}>
              Progress
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  )
}
