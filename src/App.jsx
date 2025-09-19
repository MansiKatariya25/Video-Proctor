import './App.css'
import ProctorLayout from './components/ProctorLayout.jsx'
import Schedule from './pages/Schedule.jsx'
import CandidateJoin from './pages/CandidateJoin.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Monitor from './pages/Monitor.jsx'
import { ToastHost } from './components/Toast.jsx'

function App() {
  const path = typeof location !== 'undefined' ? location.pathname : '/'
  const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('auth.token') : null

  let page = null
  if (path.startsWith('/candidate/')) page = <CandidateJoin />
  else if (path.startsWith('/interview/')) page = <ProctorLayout />
  else if (path.startsWith('/monitor/')) page = <Monitor />
  else if (path.startsWith('/login')) page = <Login />
  else if (path.startsWith('/signup')) page = <Signup />
  else if (path.startsWith('/dashboard')) page = <Dashboard />
  else if (path.startsWith('/schedule')) page = <Schedule />
  else page = token ? <Schedule /> : <Login />

  return (
    <>
      <ToastHost />
      {page}
    </>
  )
}

export default App
