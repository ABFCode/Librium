import { Link } from '@tanstack/react-router'

import './Header.css'

export default function Header() {
  return (
    <header className="header">
      <nav className="nav">
        <div className="nav-item">
          <Link to="/">Home</Link>
        </div>

        <div className="nav-item">
          <Link to="/library">Library</Link>
        </div>
      </nav>
    </header>
  )
}
