import { NavLink } from 'react-router-dom'
import './Nav.css'

/** Persistent top navbar — same pattern as Value Stream / Conway's Depot: brand links to the
 * splash page, a couple of top-level links for the rest. */
export default function Nav() {
  return (
    <nav className="dwmp-nav">
      <NavLink to="/about" className="dwmp-nav__brand">
        Dude, Where's My Part?
      </NavLink>
      <div className="dwmp-nav__links">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `dwmp-nav__link ${isActive ? 'dwmp-nav__link--active' : ''}`}
        >
          Leaderboard
        </NavLink>
        <NavLink
          to="/parts"
          className={({ isActive }) => `dwmp-nav__link ${isActive ? 'dwmp-nav__link--active' : ''}`}
        >
          Parts
        </NavLink>
        <NavLink
          to="/import"
          className={({ isActive }) => `dwmp-nav__link ${isActive ? 'dwmp-nav__link--active' : ''}`}
        >
          Import
        </NavLink>
      </div>
    </nav>
  )
}
