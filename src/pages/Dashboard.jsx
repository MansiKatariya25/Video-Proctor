import { useEffect, useState } from 'react'
import api from '../lib/axios.js'

function getToken() { return localStorage.getItem('auth.token') || '' }

export default function Dashboard() {
  const [list, setList] = useState([])
  const [reports, setReports] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    const t = getToken()
    if (!t) { location.href = '/login'; return }
    (async () => {
      try {
        const { data } = await api.get('/api/interviews')
        if (!data?.ok) throw new Error(data.error || 'Failed to load')
        setList(data.interviews)
        setReports(data.reports || {})
      } catch (e) { setError(e.message) }
    })()
  }, [])

  const logout = () => {
    localStorage.removeItem('auth.token')
    localStorage.removeItem('auth.user')
    location.href = '/login'
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Interviews Dashboard</h1>
        <div className="space-x-2">
          <a className="btn-outline" href="/schedule">Schedule New</a>
          <button className="btn-secondary" onClick={logout}>Logout</button>
        </div>
      </div>
      {error && <div className="text-rose-600 mb-3">{error}</div>}
      {list.length === 0 ? (
        <div className="text-gray-600">No interviews yet.</div>
      ) : (
        <div className="space-y-2">
          {list.map((i) => {
            const r = reports[i.sessionId]
            const score = r?.score
            const candidateUrl = `${location.origin}/candidate/${i.token}`
            const pdfUrl = `/api/reports/${encodeURIComponent(i.sessionId)}/pdf`
            return (
              <div key={i._id} className="border rounded p-3 bg-white/70">
                <div className="font-medium">{i.title || 'Untitled'}</div>
                <div className="text-sm text-gray-600">Scheduled: {i.scheduledAt ? new Date(i.scheduledAt).toLocaleString() : '—'}</div>
                <div className="text-sm">Candidate Link: <a className="text-sky-700 underline break-all" href={candidateUrl} target="_blank" rel="noreferrer">{candidateUrl}</a></div>
                <div className="text-sm">Session: <code>{i.sessionId}</code></div>
                <div className="mt-1 text-sm">
                  {score !== undefined ? (
                    <span>Report: Integrity <b>{score}</b>/100</span>
                  ) : (
                    <span className="text-gray-600">Report: not generated</span>
                  )}
                  <a className="ml-3 text-sky-700 underline" href={`/monitor/${encodeURIComponent(i.sessionId)}`}>Open Live</a>
                  {score !== undefined && (
                    <a className="ml-3 text-sky-700 underline" href={pdfUrl} target="_blank" rel="noreferrer">Download PDF</a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
