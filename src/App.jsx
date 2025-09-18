import './App.css'
import ProctorLayout from './components/ProctorLayout.jsx'
import Schedule from './pages/Schedule.jsx'
import CandidateJoin from './pages/CandidateJoin.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Monitor from './pages/Monitor.jsx'

function App() {
  const path = typeof location !== 'undefined' ? location.pathname : '/'
  if (path.startsWith('/candidate/')) return <CandidateJoin />
  if (path.startsWith('/interview/')) return <ProctorLayout />
  if (path.startsWith('/monitor/')) return <Monitor />
  if (path.startsWith('/login')) return <Login />
  if (path.startsWith('/signup')) return <Signup />
  if (path.startsWith('/dashboard')) return <Dashboard />
  if (path.startsWith('/schedule')) return <Schedule />
  // Default landing: if logged in, go to Schedule for interview creation
  const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('auth.token') : null
  return token ? <Schedule /> : <Login />
}

export default App
