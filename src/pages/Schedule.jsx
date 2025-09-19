import { useEffect, useState } from 'react'
import { Calendar, Users, Mail, User, Link, Copy, Check, Monitor, Video, AlertCircle, Loader2 } from 'lucide-react'
import api from '../lib/axios.js'
import { toast } from '../components/Toast.jsx'

export default function Schedule() {
  const [title, setTitle] = useState('')
  const [interviewerName, setInterviewerName] = useState('')
  const [interviewerEmail, setInterviewerEmail] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

   const [me, setMe] = useState(() => {
      try { return JSON.parse(localStorage.getItem('auth.user') || 'null') } catch { return null }
    })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const token = localStorage.getItem('auth.token') || ''
      if (!token) { location.href = '/login'; return }
      const { data } = await api.post('/api/interviews', { title, interviewerName, interviewerEmail, scheduledAt: scheduledAt || undefined, token })
      if (!data?.ok) throw new Error(data?.error || 'Failed to create')
      setResult(data)
      toast({ type: 'success', title: 'Interview scheduled' })
    } catch (e) {
      setError(e.message)
      toast({ type: 'error', title: 'Failed to schedule', message: e.message })
    } finally {
      setIsLoading(false)
    }
  }

  const copyCandidate = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(()=>setCopied(false), 1200)
    } catch {}
  }

  useEffect(() => {
    // Refresh profile from backend (optional)
    api.get('/api/auth/me').then(({ data }) => {
      if (data?.ok && data.user) {
        setMe(data.user)
        localStorage.setItem('auth.user', JSON.stringify(data.user))
      }
    })
  }, [])

  const monitorUrl = result?.interview?.sessionId ? `${location.origin}/monitor/${encodeURIComponent(result.interview.sessionId)}` : ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white grid place-items-center font-bold text-xl shadow-lg">
                VP
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Schedule Job Interviews</h1>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Interviewer
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-medium text-gray-900">{me?.name || '—'}</div>
                <div className="text-sm text-gray-500">{me?.email || ''}</div>
              </div>
              <div className="flex gap-2">
                <a 
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors font-medium" 
                  href="/dashboard"
                >
                  Dashboard
                </a>
                <a 
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-sm" 
                  href="/schedule"
                >
                  Schedule
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Schedule Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              {/* Form Header */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
                <div className="flex items-center gap-3">
                  <Calendar className="w-8 h-8" />
                  <div>
                    <h2 className="text-2xl font-bold">Schedule Interview</h2>
                    <p className="text-blue-100">Create a new interview session</p>
                  </div>
                </div>
              </div>

              {/* Form Body */}
              <div className="p-6">
                <form onSubmit={submit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Interview Title
                    </label>
                    <input 
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder-gray-400" 
                      value={title} 
                      onChange={(e)=>setTitle(e.target.value)} 
                      placeholder="e.g., Frontend Engineer Interview" 
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Your Name
                      </label>
                      <input 
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder-gray-400" 
                        value={interviewerName} 
                        onChange={(e)=>setInterviewerName(e.target.value)}
                        placeholder="Enter your full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Your Email
                      </label>
                      <input 
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder-gray-400" 
                        value={interviewerEmail} 
                        onChange={(e)=>setInterviewerEmail(e.target.value)}
                        placeholder="Enter your email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Scheduled At
                    </label>
                    <input 
                      type="datetime-local" 
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                      value={scheduledAt} 
                      onChange={(e)=>setScheduledAt(e.target.value)} 
                    />
                    <p className="text-sm text-gray-500">Optional: Set a specific date and time for the interview</p>
                  </div>

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-700 text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                      </p>
                    </div>
                  )}

                  <button 
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-3 px-4 rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2" 
                    type="submit"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating Interview...
                      </>
                    ) : (
                      <>
                        <Link className="w-5 h-5" />
                        Create Interview Link
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          {result && (
            <div className="space-y-6">
              {/* Candidate Link */}
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-600 to-green-600 p-4 text-white">
                  <div className="flex items-center gap-2">
                    <Users className="w-6 h-6" />
                    <h3 className="font-bold">Share with Candidate</h3>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="p-3 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a 
                        className="text-blue-600 hover:text-blue-700 underline text-sm font-medium break-all flex-1" 
                        href={result.candidateUrl} 
                        target="_blank" 
                        rel="noreferrer"
                      >
                        {result.candidateUrl}
                      </a>
                      <button 
                        type="button" 
                        className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm rounded-md transition-colors flex items-center gap-1" 
                        onClick={()=>copyCandidate(result.candidateUrl)}
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Session ID:</span> 
                    <code className="ml-1 px-2 py-1 bg-gray-100 rounded text-xs font-mono">{result?.interview?.sessionId}</code>
                  </div>
                </div>
              </div>

              {/* Interviewer Panel */}
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 text-white">
                  <div className="flex items-center gap-2">
                    <Video className="w-6 h-6" />
                    <h3 className="font-bold">Join as Interviewer</h3>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  <a 
                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white py-3 px-4 rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] flex items-center justify-center gap-2" 
                    href={monitorUrl}
                  >
                    <Monitor className="w-5 h-5" />
                    Open Monitor Dashboard
                  </a>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      <span className="font-medium">Live Session:</span> {result?.interview?.sessionId}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Candidate will be redirected to /interview/{'{sessionId}'} after verification. The session ID stays the same.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}