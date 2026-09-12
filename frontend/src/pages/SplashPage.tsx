import { Link } from 'react-router-dom'
import Nav from '../components/Nav'
import './SplashPage.css'

const STATIONS = ['Kitting', 'Machine', 'Weld', 'Paint', 'Assembly', 'QA', 'Ship']
const STUCK_INDEX = 2 // "Weld" — the part sitting still in the figure below

const FEATURES = [
  {
    title: 'Pulled from what already tracks it',
    body: "S4 already knows where a part is — this doesn't replace that. It turns the report someone has to be asked to run into something you just look at.",
  },
  {
    title: 'Dwell, not a schedule',
    body: 'No "on time / late" judgment against a plan — the routing data behind that is known to run unreliable. Just how long, in wall-clock time, a part has actually been sitting still.',
  },
  {
    title: 'One visible hot list',
    body: "Expediting today means an email or a phone call nobody else sees. A flag here is visible to the floor, with who asked and why — not another inbox.",
  },
]

export default function SplashPage() {
  return (
    <div className="splash-page">
      <Nav />
      <div className="splash-page__scroll">
        <div className="splash-page__content">
          <header className="splash-hero">
            <h1 className="splash-hero__title">Dude, Where's My Part?</h1>
            <p className="splash-hero__sub">
              Every part's status, as of the last extract — no email required. Flag what needs
              to jump the queue, and the floor sees it without a phone call.
            </p>
            <div className="splash-hero__actions">
              <Link className="splash-btn splash-btn--primary" to="/">View the leaderboard</Link>
              <Link className="splash-btn splash-btn--ghost" to="/parts">View parts</Link>
            </div>
          </header>

          <figure className="splash-figure">
            <svg viewBox="0 0 720 140" role="img" aria-labelledby="dwmp-figure-title">
              <title id="dwmp-figure-title">
                A part sits at the Weld station for six days while the rest of the line moves —
                visible at a glance instead of an email asking where it is.
              </title>
              {STATIONS.map((name, i) => {
                const x = 20 + i * 100
                const stuck = i === STUCK_INDEX
                return (
                  <g key={name}>
                    <rect
                      x={x} y={30} width={80} height={50} rx={8}
                      fill={stuck ? 'var(--color-accent-soft)' : 'var(--color-surface-sunken)'}
                      stroke={stuck ? 'var(--color-accent)' : 'var(--color-border-strong)'}
                      strokeWidth={stuck ? 2 : 1}
                    />
                    <text x={x + 40} y={59} textAnchor="middle" className="splash-figure__station">
                      {name}
                    </text>
                    {i < STATIONS.length - 1 && (
                      <path d={`M${x + 82} 55 L${x + 98} 55`} stroke="var(--color-border-strong)" strokeWidth={1.5} markerEnd="url(#arrow)" />
                    )}
                    {stuck && (
                      <text x={x + 40} y={100} textAnchor="middle" className="splash-figure__flag">
                        🔥 6 days
                      </text>
                    )}
                  </g>
                )
              })}
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-border-strong)" />
                </marker>
              </defs>
            </svg>
          </figure>

          <div className="splash-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="splash-card">
                <div className="splash-card__heading">{f.title}</div>
                <p className="splash-card__body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
