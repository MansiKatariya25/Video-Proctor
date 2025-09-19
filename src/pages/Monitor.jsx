import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Monitor as MonitorIcon, Video, VideoOff, PlayCircle, StopCircle, FileText, Download, AlertTriangle, Send, Eye, Users, Wifi, WifiOff } from 'lucide-react'
import api from '../lib/axios.js'
import useWebRTC from '../hooks/useWebRTC.js'
import { toast } from '../components/Toast.jsx'

function useSessionIdFromPath(prefix='/monitor/') {
  return useMemo(() => {
    if (typeof window === 'undefined') return ''
    const path = window.location.pathname || ''
    const idx = path.indexOf(prefix)
    if (idx === -1) return ''
    return decodeURIComponent(path.slice(idx + prefix.length))
  }, [])
}

export default function Monitor() {
  const sessionId = useSessionIdFromPath('/monitor/')
  const remoteVideoRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const localVideoRef = useRef(null)
  const [events, setEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [localStream, setLocalStreamState] = useState(null)
  const [error, setError] = useState('')
  const [remoteActive, setRemoteActive] = useState(false)
  const [liveStatus, setLiveStatus] = useState(null)
  const [lastDetection, setLastDetection] = useState('')

  // Recording state for remote stream
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const [recording, setRecording] = useState(false)
  const [recordedUrl, setRecordedUrl] = useState('')

  // Report state
  const [reportStatus, setReportStatus] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('auth.token')
    if (!token) location.href = '/login'
  }, [])

  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current
    const video = remoteVideoRef.current
    const s = liveStatus
    if (!canvas || !video) return
    const vw = video.videoWidth || 0
    const vh = video.videoHeight || 0
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    if (rect.width === 0 || rect.height === 0 || vw === 0 || vh === 0) return
    const cw = rect.width, ch = rect.height
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(ch * dpr)
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch)

    if (!s) return
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.8)'
    ctx.fillRect(5, 5, 260, 78)
    ctx.fillStyle = '#00ff00'
    ctx.font = 'bold 13px monospace'
    ctx.fillText(`Faces: ${s.faces ?? 0}`, 15, 24)
    ctx.fillText(`Looking: ${s.lookingAtScreen ? 'YES' : 'NO'}`, 15, 42)
    if (s.eye) {
      const ear = Number(s.eye.avgEAR||0).toFixed(3)
      const d = s.eye.eyesClosed ? 'CLOSED' : 'OPEN'
      ctx.fillText(`EAR: ${ear} (${d})`, 15, 60)
    }
    ctx.restore()
  }, [liveStatus])

  useEffect(() => {
    const id = requestAnimationFrame(function loop(){ drawOverlay(); requestAnimationFrame(id) })
    return () => cancelAnimationFrame(id)
  }, [drawOverlay])

  const handleRemoteStream = useCallback(({ stream }) => {
    setRemoteActive(Boolean(stream))
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream || null
      if (stream) {
        remoteVideoRef.current.play().catch(() => {})
      }
    }
  }, [])

  const handleIncomingEvent = useCallback((event) => {
    if (!event) return
    if (event.type === 'live-status') {
      setLiveStatus({ faces: event.faces, lookingAtScreen: event.lookingAtScreen, eye: event.eye, objects: event.objects || [], time: event.time })
      setLastDetection(event.time || '')
      if (event.eye?.eyesClosed) toast({ type:'warning', title:'Eyes closed detected' })
      if ((event.eye?.drowsinessLevel||0) > 30) toast({ type:'warning', title:'Drowsiness detected' })
      return
    }
    setEvents((prev) => [event, ...prev])
  }, [])

  // Initialize WebRTC BEFORE callbacks that depend on sendEvent
  const { setLocalStream, sendEvent, connected } = useWebRTC({
    sessionId,
    role: 'interviewer',
    onRemoteStream: handleRemoteStream,
    onEvent: handleIncomingEvent,
  })

  const startLocalMedia = useCallback(async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setLocalStream(stream)
      setLocalStreamState(stream)
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
    } catch (e) {
      setError(e?.message || 'Failed to access camera/microphone')
    }
  }, [setLocalStream])

  const stopLocalMedia = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
      setLocalStream(null)
      setLocalStreamState(null)
      if (localVideoRef.current) localVideoRef.current.srcObject = null
    }
  }, [localStream, setLocalStream])

  // Start recording the remote (candidate) stream
  const startRecording = useCallback(() => {
    try {
      const stream = remoteVideoRef.current?.srcObject
      if (!stream) { setError('No remote stream to record'); toast({ type:'warning', title:'No remote stream' }); return }
      recordedChunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' })
      mediaRecorderRef.current = mr
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        if (recordedUrl) URL.revokeObjectURL(recordedUrl)
        setRecordedUrl(url)
      }
      mr.start(1000)
      setRecording(true)
      toast({ type:'success', title:'Recording started' })
    } catch (e) {
      setError(e.message || 'Failed to start recording')
      toast({ type:'error', title:'Recording failed', message:e.message })
    }
  }, [recordedUrl])

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') {
      mr.stop()
      setRecording(false)
      toast({ type:'success', title:'Recording saved' })
    }
  }, [])

  // Generate report on demand
  const generateReport = useCallback(async () => {
    setReportStatus('')
    try {
      const { data } = await api.get(`/api/reports/${sessionId}`)
      if (!data?.report) throw new Error('Failed to generate report')
      setReportStatus('Report generated')
      toast({ type:'success', title:'Report generated' })
    } catch (e) {
      setReportStatus(e.message)
      toast({ type:'error', title:'Report failed', message:e.message })
    }
  }, [sessionId])

  const apiOrigin = (import.meta.env.VITE_BASE_URL || location.origin).replace(/\/$/, '')
  const pdfUrl = `${apiOrigin}/api/reports/${encodeURIComponent(sessionId)}/pdf`

  const sendManualAlert = useCallback((message) => {
    if (!message) return
    const evt = { time: new Date().toISOString(), type: 'interviewer-note', details: message, sessionId }
    sendEvent(evt)
    api.post('/api/events', evt).catch(() => {})
    setEvents((prev) => [evt, ...prev])
  }, [sendEvent, sessionId])

  const endInterview = useCallback(async () => {
    try {
      const ok = window.confirm('End this interview now?')
      if (!ok) return
      const time = new Date().toISOString()
      await api.post('/api/sessions', { sessionId, endedAt: time })
      // Notify candidate/other viewers
      sendEvent({ time, type: 'interview-ended', details: 'Interview ended by interviewer', sessionId })
      toast({ type:'success', title:'Interview ended' })
      // Small delay to let event flush
      setTimeout(() => { location.href = '/dashboard' }, 300)
    } catch (e) {
      setError(e?.message || 'Failed to end interview')
      toast({ type:'error', title:'Failed to end interview', message:e.message })
    }
  }, [sessionId, sendEvent])

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    setLoadingEvents(true)
    api.get(`/api/events`, { params: { sessionId, limit: 200 } }).then(({ data }) => {
      if (!cancelled && data?.ok) {
        setEvents(data.events || [])
      }
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoadingEvents(false)
    })
    return () => { cancelled = true }
  }, [sessionId])

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop())
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    }
  }, [localStream, recordedUrl])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white grid place-items-center font-bold text-lg">VP</div>
              <div>
                <h1 className="font-bold text-gray-900 flex items-center gap-2">
                  <MonitorIcon className="w-4 h-4" />
                  Live Interview Monitor
                </h1>
                <p className="text-xs text-gray-600">
                  Session: <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{sessionId}</code>
                </p>
              </div>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-medium rounded-full">Interviewer</span>
            </div>
            <a className="px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded text-sm font-medium transition-colors" href="/dashboard">
              Dashboard
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Video Section */}
          <div className="lg:col-span-2 space-y-3">
            {/* Video Container */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="relative bg-gray-900 aspect-video">
                <video ref={remoteVideoRef} className={`absolute inset-0 w-full h-full object-contain ${remoteActive ? '' : 'opacity-30'}`} autoPlay playsInline muted></video>
                <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none"></canvas>
                {!remoteActive && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/70">
                    <div className="text-center">
                      <Video className="w-16 h-16 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Waiting for candidate stream...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Status Grid */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Users className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-600">Faces:</span>
                  <span className="font-medium">{liveStatus?.faces ?? 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-600">Looking:</span>
                  <span className="font-medium">{liveStatus?.lookingAtScreen ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {connected ? <Wifi className="w-3 h-3 text-green-500" /> : <WifiOff className="w-3 h-3 text-red-500" />}
                  <span className="text-gray-600">Status:</span>
                  <span className="font-medium">{connected ? 'Connected' : 'Waiting'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Video className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-600">Remote:</span>
                  <span className="font-medium">{remoteActive ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Objects:</span>
                  <span className="font-medium text-xs">{liveStatus?.objects?.length ? liveStatus.objects.join(', ') : 'None'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Detection:</span>
                  <span className="font-medium text-xs">{lastDetection || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Controls Panel */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              {/* Main Controls */}
              <div className="flex flex-wrap gap-2 mb-3">
                {!localStream ? (
                  <button 
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium flex items-center gap-2 transition-colors" 
                    onClick={startLocalMedia}
                  >
                    <Video className="w-4 h-4" />
                    Enable Camera
                  </button>
                ) : (
                  <button 
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium flex items-center gap-2 transition-colors" 
                    onClick={stopLocalMedia}
                  >
                    <VideoOff className="w-4 h-4" />
                    Disable Camera
                  </button>
                )}
                
                {!recording ? (
                  <button 
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded text-sm font-medium flex items-center gap-2 transition-colors" 
                    onClick={startRecording} 
                    disabled={!remoteActive}
                  >
                    <PlayCircle className="w-4 h-4" />
                    Record
                  </button>
                ) : (
                  <button 
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium flex items-center gap-2 transition-colors" 
                    onClick={stopRecording}
                  >
                    <StopCircle className="w-4 h-4" />
                    Stop Recording
                  </button>
                )}
                
                <button 
                  className="px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded text-sm font-medium flex items-center gap-2 transition-colors" 
                  onClick={generateReport}
                >
                  <FileText className="w-4 h-4" />
                  Generate Report
                </button>
                
                <a 
                  className="px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded text-sm font-medium flex items-center gap-2 transition-colors" 
                  href={pdfUrl} 
                  target="_blank" 
                  rel="noreferrer"
                >
                  <Download className="w-4 h-4" />
                  PDF
                </a>
                
                <button 
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium flex items-center gap-2 transition-colors" 
                  onClick={endInterview}
                >
                  <AlertTriangle className="w-4 h-4" />
                  End Interview
                </button>
              </div>

              {/* Status Messages */}
              {error && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {error}
                </div>
              )}
              {reportStatus && (
                <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
                  {reportStatus}
                </div>
              )}

              {/* Bottom Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Local Video Preview */}
                <div>
                  <p className="text-xs text-gray-600 mb-1">Your Camera</p>
                  <div className="relative bg-gray-900 rounded overflow-hidden aspect-video">
                    <video ref={localVideoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay muted playsInline></video>
                    {!localStream && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <VideoOff className="w-8 h-8 text-white/50" />
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Quick Alert */}
                <div>
                  <p className="text-xs text-gray-600 mb-1">Quick Alert</p>
                  <ManualAlert onSend={sendManualAlert} />
                </div>
              </div>

              {/* Download Recording */}
              {recordedUrl && (
                <div className="mt-3 pt-3 border-t">
                  <a 
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium flex items-center gap-2 transition-colors w-fit" 
                    href={recordedUrl} 
                    download={`recording-${Date.now()}.webm`}
                  >
                    <Download className="w-4 h-4" />
                    Download Recording
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Live Alerts Sidebar */}
          <div className="bg-white rounded-lg border border-gray-200 h-[60vh]">
            <div className="p-3 border-b bg-gray-50">
              <h3 className="font-medium text-gray-900">Live Alerts</h3>
            </div>
            <div className="h-96 overflow-auto">
              <div className="p-3 space-y-2">
                {loadingEvents ? (
                  <div className="text-gray-500 text-sm text-center py-4">Loading events...</div>
                ) : events.length === 0 ? (
                  <div className="text-gray-500 text-sm text-center py-4">No events yet</div>
                ) : (
                  events.map((ev, idx) => (
                    <div key={idx} className="border-b border-gray-100 pb-2 last:border-b-0">
                      <div className="text-xs text-gray-500">{ev.time || '—'}</div>
                      <div className="text-sm">
                        <span className="font-medium">{ev.type}</span>
                        <span className="text-gray-600"> — {ev.details}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ManualAlert({ onSend }) {
  const inputRef = useRef(null)

  const send = useCallback(() => {
    const value = inputRef.current?.value?.trim()
    if (!value) return
    onSend?.(value)
    inputRef.current.value = ''
  }, [onSend])

  return (
    <div className="space-y-2">
      <textarea 
        ref={inputRef} 
        className="w-full px-2 py-1 border border-gray-300 rounded text-sm resize-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500" 
        rows={3}
        placeholder="Quick note to log..."
        onKeyDown={(e)=>{ if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} 
      />
      <button 
        className="w-full px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors" 
        type="button" 
        onClick={send}
      >
        <Send className="w-4 h-4" />
        Send Alert
      </button>
    </div>
  )
}