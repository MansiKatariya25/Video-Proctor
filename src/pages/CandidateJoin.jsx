import { useEffect, useRef, useState } from 'react'

export default function CandidateJoin() {
  const token = (typeof location !== 'undefined' ? location.pathname.split('/').pop() : '')
  const [interview, setInterview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [camOk, setCamOk] = useState(false)
  const [micOk, setMicOk] = useState(false)
  const videoRef = useRef(null)
  const micStreamRef = useRef(null)
  const camStreamRef = useRef(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/interviews/${token}`)
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || 'Not found')
        setInterview(data.interview)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      stopCam()
      stopMic()
    }
  }, [token])

  const testCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
      camStreamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamOk(true)
    } catch (e) {
      setError('Camera test failed: ' + e.message)
    }
  }
  const stopCam = () => {
    const s = camStreamRef.current
    if (s) { s.getTracks().forEach(t=>t.stop()); camStreamRef.current = null }
    if (videoRef.current) videoRef.current.srcObject = null
  }

  const testMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      setMicOk(true)
      // stop after short delay to free mic
      setTimeout(() => { stopMic() }, 800)
    } catch (e) {
      setError('Microphone test failed: ' + e.message)
    }
  }
  const stopMic = () => {
    const s = micStreamRef.current
    if (s) { s.getTracks().forEach(t=>t.stop()); micStreamRef.current = null }
  }

  const startInterview = async () => {
    if (!name || !email) { setError('Please enter name and email'); return }
    if (!camOk || !micOk) { setError('Please test camera and microphone'); return }
    try {
      // Save candidate info to interview
      await fetch(`/api/interviews/${token}/candidate`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ candidateName: name, candidateEmail: email }) })
      // Persist session + name for the proctoring app
      if (interview?.sessionId) localStorage.setItem('proctor.sessionId', interview.sessionId)
      localStorage.setItem('proctor.candidateName', name)
      // Also upsert session on backend
      await fetch('/api/sessions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sessionId: interview.sessionId, candidateName: name }) })
      // Navigate to proctor page bound to this session
      location.href = `/interview/${encodeURIComponent(interview.sessionId)}`
    } catch (e) {
      setError(e.message || 'Failed to start')
    }
  }

  if (loading) return <div className="p-6">Loading…</div>
  if (error) return <div className="p-6 text-rose-600">{error}</div>
  if (!interview) return <div className="p-6">Not found</div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Join Interview</h1>
      {interview.title && <div className="text-gray-600 mb-4">{interview.title}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Full Name</label>
            <input className="w-full border rounded px-2 py-1" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input className="w-full border rounded px-2 py-1" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="space-x-2">
            <button className="btn" onClick={testCamera}>Test Camera</button>
            <button className="btn-secondary" onClick={testMic}>Test Microphone</button>
          </div>
          <div className="text-sm text-gray-600">Camera: <b>{camOk ? 'OK' : 'Not tested'}</b> · Mic: <b>{micOk ? 'OK' : 'Not tested'}</b></div>
          {error && <div className="text-rose-600 text-sm">{error}</div>}
          <button className="btn" onClick={startInterview}>Start Interview</button>
          <div className="text-xs text-gray-500">You’ll be asked for camera + mic permission.</div>
        </div>
        <div>
          <div className="relative aspect-video bg-black rounded overflow-hidden">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain" playsInline muted></video>
          </div>
        </div>
      </div>
    </div>
  )
}
