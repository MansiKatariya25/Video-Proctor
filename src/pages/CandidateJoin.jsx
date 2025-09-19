import { useEffect, useRef, useState } from 'react'
import { Video, Mic, User, Mail, Play, AlertCircle, Loader2, UserCheck, Settings } from 'lucide-react'
import api from '../lib/axios.js'
import { toast } from '../components/Toast.jsx'

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
        const { data } = await api.get(`/api/interviews/${token}`)
        if (!data?.ok) throw new Error(data.error || 'Not found')
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
      toast({ type: 'success', title: 'Camera test successful', message: 'Your camera is working properly' })
    } catch (e) {
      setError('Camera test failed: ' + e.message)
      toast({ type: 'error', title: 'Camera test failed', message: e.message })
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
      toast({ type: 'success', title: 'Microphone test successful', message: 'Your microphone is working properly' })
      // stop after short delay to free mic
      setTimeout(() => { stopMic() }, 800)
    } catch (e) {
      setError('Microphone test failed: ' + e.message)
      toast({ type: 'error', title: 'Microphone test failed', message: e.message })
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
      await api.post(`/api/interviews/${token}/candidate`, { candidateName: name, candidateEmail: email })
      // Persist session + name for the proctoring app
      if (interview?.sessionId) localStorage.setItem('proctor.sessionId', interview.sessionId)
      localStorage.setItem('proctor.candidateName', name)
      // Also upsert session on backend
      await api.post('/api/sessions', { sessionId: interview.sessionId, candidateName: name })
      // Navigate to proctor page bound to this session
      location.href = `/interview/${encodeURIComponent(interview.sessionId)}`
    } catch (e) {
      setError(e.message || 'Failed to start')
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
        <p className="text-gray-600">Loading interview details...</p>
      </div>
    </div>
  )
  
  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-red-50 to-rose-100 flex items-center justify-center">
      <div className="text-center p-8 bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
        <p className="text-red-600">{error}</p>
      </div>
    </div>
  )
  
  if (!interview) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex items-center justify-center">
      <div className="text-center p-8 bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md">
        <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Not Found</h2>
        <p className="text-gray-600">Interview session not found</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white flex items-center justify-center font-bold text-xl shadow-lg">
              J
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5" />
                Join Interview
              </h1>
              <p className="text-sm text-gray-600">Complete setup to begin your interview</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Setup Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              {/* Form Header */}
              <div className="bg-gradient-to-r from-emerald-600 to-green-600 p-3 text-white">
                <div className="flex items-center gap-3">
                  <Settings className="w-8 h-8" />
                  <div>
                    <h2 className="text-2xl font-bold">Interview Setup</h2>
                    <p className="text-emerald-100">
                      {interview.title ? interview.title : 'Complete your setup to join'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Body */}
              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column - Form */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <User className="w-4 h-4" />
                        Full Name
                      </label>
                      <input 
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors placeholder-gray-400" 
                        value={name} 
                        onChange={(e)=>setName(e.target.value)} 
                        placeholder="Your full name" 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <Mail className="w-4 h-4" />
                        Email Address
                      </label>
                      <input 
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors placeholder-gray-400" 
                        value={email} 
                        onChange={(e)=>setEmail(e.target.value)} 
                        placeholder="you@example.com" 
                      />
                    </div>

                    {/* Device Tests */}
                    <div className="space-y-4">
                      <h3 className="font-medium text-gray-900">Device Setup</h3>
                      <div className="flex gap-3">
                        <button 
                          className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2" 
                          onClick={testCamera}
                        >
                          <Video className="w-4 h-4" />
                          Test Camera
                        </button>
                        <button 
                          className="flex-1 px-4 py-3 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2" 
                          onClick={testMic}
                        >
                          <Mic className="w-4 h-4" />
                          Test Mic
                        </button>
                      </div>

                      {/* Status Indicators */}
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center gap-2 text-sm ${camOk ? 'text-green-700' : 'text-gray-600'}`}>
                            <div className={`w-2 h-2 rounded-full ${camOk ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                            Camera: <span className="font-medium">{camOk ? 'Ready' : 'Not tested'}</span>
                          </div>
                          <div className={`flex items-center gap-2 text-sm ${micOk ? 'text-green-700' : 'text-gray-600'}`}>
                            <div className={`w-2 h-2 rounded-full ${micOk ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                            Microphone: <span className="font-medium">{micOk ? 'Ready' : 'Not tested'}</span>
                          </div>
                        </div>
                      </div>
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
                      className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white py-3 px-4 rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] flex items-center justify-center gap-2" 
                      onClick={startInterview}
                    >
                      <Play className="w-5 h-5" />
                      Start Interview
                    </button>

                    <p className="text-xs text-gray-500 text-center">
                      You'll be asked for camera and microphone permissions when starting.
                    </p>
                  </div>

                  {/* Right Column - Video Preview */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-gray-900">Camera Preview</h3>
                    <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
                      <video 
                        ref={videoRef} 
                        className="absolute inset-0 w-full h-full object-contain" 
                        playsInline 
                        muted
                      ></video>
                      {!camOk && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center text-white">
                            <Video className="w-16 h-16 mx-auto mb-3 opacity-50" />
                            <p className="text-sm opacity-75">Click "Test Camera" to preview</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interview Details */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden h-fit">
            <div className="bg-gradient-to-r from-gray-600 to-slate-600 p-4 text-white">
              <div className="flex items-center gap-2">
                <Settings className="w-6 h-6" />
                <h3 className="font-bold">Interview Details</h3>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Session ID</p>
                <code className="text-sm bg-gray-100 px-3 py-2 rounded-md font-mono block">{interview.sessionId}</code>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Organizer</p>
                <p className="text-gray-600">{interview.interviewerName || 'Not specified'}</p>
              </div>
              {interview.scheduledAt && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Scheduled Time</p>
                  <p className="text-gray-600">{new Date(interview.scheduledAt).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}