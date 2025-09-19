import { useEffect, useState } from 'react'
import { BarChart3, Calendar, ExternalLink, Download, Monitor, LogOut, AlertCircle, Clock, FileText } from 'lucide-react'
import api from '../lib/axios.js'

function getToken() { return localStorage.getItem('auth.token') || '' }

export default function Dashboard() {
  const [list, setList] = useState([])
  const [reports, setReports] = useState({})
  const [error, setError] = useState('')
  const [me, setMe] = useState(() => {
    try { return JSON.parse(localStorage.getItem('auth.user') || 'null') } catch { return null }
  })

  useEffect(() => {
    const t = getToken()
    if (!t) { location.href = '/login'; return }
    // Load interviews
    (async () => {
      try {
        const { data } = await api.get('/api/interviews')
        if (!data?.ok) throw new Error(data.error || 'Failed to load')
        setList(data.interviews)
        setReports(data.reports || {})
      } catch (e) { setError(e.message) }
    })()
    // Refresh profile from backend (optional)
    api.get('/api/auth/me').then(({ data }) => {
      if (data?.ok && data.user) {
        setMe(data.user)
        localStorage.setItem('auth.user', JSON.stringify(data.user))
      }
    }).catch(() => {})
  }, [])

  const logout = () => {
    localStorage.removeItem('auth.token')
    localStorage.removeItem('auth.user')
    location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white grid place-items-center font-bold text-xl shadow-lg">
                VP
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Interviews Dashboard
                </h1>
                <p className="text-sm text-gray-600">Overview & Management</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Interviewer
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-medium text-gray-900">{me?.name || '—'}</div>
                <div className="text-sm text-gray-500">{me?.email || ''}</div>
              </div>
              <a 
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-sm flex items-center gap-2" 
                href="/schedule"
              >
                <Calendar className="w-4 h-4" />
                Schedule New
              </a>
              <button 
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors font-medium flex items-center gap-2" 
                onClick={logout}
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          </div>
        )}

        {list.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No interviews yet</h3>
            <p className="text-gray-600 mb-4">Get started by scheduling your first interview</p>
            <a 
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-sm" 
              href="/schedule"
            >
              <Calendar className="w-4 h-4" />
              Schedule Interview
            </a>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {list.map((i) => {
              const r = reports[i.sessionId]
              const score = r?.score
              const candidateUrl = `${location.origin}/candidate/${i.token}`
              const apiOrigin = (import.meta.env.VITE_BASE_URL || location.origin).replace(/\/$/, '')
              const pdfUrl = `${apiOrigin}/api/reports/${encodeURIComponent(i.sessionId)}/pdf`
              
              return (
                <div key={i._id} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-200">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2">{i.title || 'Untitled Interview'}</h3>
                      <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                        <Clock className="w-4 h-4" />
                        {i.scheduledAt ? new Date(i.scheduledAt).toLocaleString() : 'Not scheduled'}
                      </div>
                      <div className="text-sm text-gray-500">
                        Session: <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{i.sessionId}</code>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                      score !== undefined 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {score !== undefined ? `Score: ${score}` : 'Pending'}
                    </div>
                  </div>
                  
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs font-medium text-blue-800 mb-1">Candidate Link:</p>
                    <a 
                      className="text-blue-600 hover:text-blue-700 text-xs break-all underline" 
                      href={candidateUrl} 
                      target="_blank" 
                      rel="noreferrer"
                    >
                      {candidateUrl}
                    </a>
                  </div>
                  
                  <div className="flex gap-2">
                    <a 
                      className="flex-1 px-3 py-2 border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2" 
                      href={`/monitor/${encodeURIComponent(i.sessionId)}`}
                    >
                      <Monitor className="w-4 h-4" />
                      Live View
                    </a>
                    {score !== undefined && (
                      <a 
                        className="flex-1 px-3 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2" 
                        href={pdfUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        download
                      >
                        <Download className="w-4 h-4" />
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}