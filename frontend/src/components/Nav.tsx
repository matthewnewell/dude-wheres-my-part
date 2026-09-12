import { NavLink } from 'react-router-dom'
import './Nav.css'

/** Persistent top navbar — same pattern as Value Stream / Conway's Depot: brand links to the
 * splash page, a couple of top-level links for the rest. Just two: Assembly (the consolidated
 * leaderboard-that-drills-into-parts view — what a project actually cares about, "my part") and
 * Constraints (backlog by department/operation, shop-wide). Import is an admin action, not
 * something a project cares about day to day — tucked behind the gear on the right instead of
 * competing for space in the primary nav. */
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
          Assembly
        </NavLink>
        <NavLink
          to="/constraints"
          className={({ isActive }) => `dwmp-nav__link ${isActive ? 'dwmp-nav__link--active' : ''}`}
        >
          Constraints
        </NavLink>
      </div>
      <NavLink
        to="/import"
        className={({ isActive }) => `dwmp-nav__gear ${isActive ? 'dwmp-nav__gear--active' : ''}`}
        title="Import an S4 extract"
        aria-label="Admin: Import"
      >
        ⚙
      </NavLink>
    </nav>
  )
}
