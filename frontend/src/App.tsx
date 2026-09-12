import { Route, Routes } from 'react-router-dom'
import Nav from './components/Nav'
import SplashPage from './pages/SplashPage'
import LeaderboardPage from './pages/LeaderboardPage'
import AssemblyDetailPage from './pages/AssemblyDetailPage'
import PartsBoardPage from './pages/PartsBoardPage'
import PartDetailPage from './pages/PartDetailPage'
import ImportPage from './pages/ImportPage'
import './App.css'

/** Shared chrome for every operational page — same pattern as Value Stream / Conway's Depot:
 * the splash page renders its own Nav directly (it sits slightly outside the "working" flow),
 * everything else gets it via this layout. */
function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <Nav />
      <div className="app-layout__body">{children}</div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/about" element={<SplashPage />} />
      <Route path="/" element={<Layout><LeaderboardPage /></Layout>} />
      <Route path="/assemblies/:assemblyId" element={<Layout><AssemblyDetailPage /></Layout>} />
      <Route path="/parts" element={<Layout><PartsBoardPage /></Layout>} />
      <Route path="/parts/:partId" element={<Layout><PartDetailPage /></Layout>} />
      <Route path="/import" element={<Layout><ImportPage /></Layout>} />
    </Routes>
  )
}
