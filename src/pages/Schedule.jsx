import { useState } from 'react'

export default function Schedule() {
  const [title, setTitle] = useState('')
  const [interviewerName, setInterviewerName] = useState('')
  const [interviewerEmail, setInterviewerEmail] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const token = localStorage.getItem('auth.token') || ''
      if (!token) { location.href = '/login'; return }
      const res = await fetch('/api/interviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-auth-token': token },
        body: JSON.stringify({ title, interviewerName, interviewerEmail, scheduledAt: scheduledAt || undefined, token })
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to create')
      setResult(data)
    } catch (e) {
      setError(e.message)
    }
  }

  const copyCandidate = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(()=>setCopied(false), 1200)
    } catch {}
  }

  const monitorUrl = result?.interview?.sessionId ? `${location.origin}/monitor/${encodeURIComponent(result.interview.sessionId)}` : ''

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Schedule Interview</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">Title</label>
          <input className="w-full border rounded px-2 py-1" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g., Frontend Engineer Interview" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">Your Name</label>
            <input className="w-full border rounded px-2 py-1" value={interviewerName} onChange={(e)=>setInterviewerName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">Your Email</label>
            <input className="w-full border rounded px-2 py-1" value={interviewerEmail} onChange={(e)=>setInterviewerEmail(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-sm mb-1">Scheduled At</label>
          <input type="datetime-local" className="border rounded px-2 py-1" value={scheduledAt} onChange={(e)=>setScheduledAt(e.target.value)} />
        </div>
        <button className="btn" type="submit">Create Link</button>
        {error && <div className="text-rose-600 text-sm">{error}</div>}
      </form>
      {result && (
        <div className="mt-4 border rounded p-3 space-y-2">
          <div className="font-medium">Share with Candidate</div>
          <div className="flex items-center gap-2 break-all">
            <a className="text-sky-700 underline" href={result.candidateUrl} target="_blank" rel="noreferrer">{result.candidateUrl}</a>
            <button type="button" className="btn-outline !py-0.5 !px-2" onClick={()=>copyCandidate(result.candidateUrl)}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="text-sm text-gray-600">Session ID: <code>{result?.interview?.sessionId}</code></div>
          <hr className="my-2" />
          <div className="font-medium">Join as Interviewer</div>
          <div className="flex items-center gap-2">
            <a className="btn" href={monitorUrl}>Open Monitor</a>
            <div className="text-sm text-gray-600">Opens live view for session <code>{result?.interview?.sessionId}</code></div>
          </div>
          <div className="text-xs text-gray-500">Candidate will be redirected to /interview/{'{sessionId}'} after verification. The session ID stays the same.</div>
        </div>
      )}
    </div>
  )
}
