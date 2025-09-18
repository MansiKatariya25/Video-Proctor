import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../lib/axios.js'
import useWebRTC from '../hooks/useWebRTC.js'

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
    const id = requestAnimationFrame(function loop(){ drawOverlay(); requestAnimationFrame(loop) })
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
      setLiveStatus({ faces: event.faces, lookingAtScreen: event.lookingAtScreen, eye: event.eye, time: event.time })
      return
    }
    setEvents((prev) => [event, ...prev])
  }, [])

  const { setLocalStream, sendEvent, connected } = useWebRTC({
    sessionId,
    role: 'interviewer',
    onRemoteStream: handleRemoteStream,
    onEvent: handleIncomingEvent,
  })

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
    }
  }, [localStream])

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

  const sendManualAlert = useCallback((message) => {
    if (!message) return
    const evt = { time: new Date().toISOString(), type: 'interviewer-note', details: message, sessionId }
    sendEvent(evt)
    api.post('/api/events', evt).catch(() => {})
    setEvents((prev) => [evt, ...prev])
  }, [sendEvent, sessionId])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-semibold">Live Interview Monitor</h1>
        <div className="text-sm text-gray-600">Session: <code>{sessionId}</code></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden shadow">
            <video ref={remoteVideoRef} className={`absolute inset-0 w-full h-full object-contain ${remoteActive ? '' : 'opacity-30'}`} autoPlay playsInline></video>
            <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none"></canvas>
            {!remoteActive && (
              <div className="absolute inset-0 flex items-center justify-center text-white/70 text-lg">
                Waiting for candidate stream...
              </div>
            )}
          </div>

          <div className="border rounded p-3 bg-white/70">
            <div className="flex items-center justify-between">
              <div className="text-sm">Status: <b>{connected ? 'Connected' : 'Waiting'}</b></div>
              <div className="space-x-2">
                {!localStream ? (
                  <button className="btn" onClick={startLocalMedia}>Enable My Camera</button>
                ) : (
                  <button className="btn-secondary" onClick={stopLocalMedia}>Disable My Camera</button>
                )}
              </div>
            </div>
            {error && <div className="text-xs text-rose-600 mt-2">{error}</div>}
            <div className="mt-3 flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="text-xs text-gray-600 mb-1">Your preview</div>
                <div className="relative w-full h-40 bg-gray-900 rounded overflow-hidden">
                  <video ref={localVideoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay muted playsInline></video>
                </div>
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-600 mb-1">Quick alert</div>
                <ManualAlert onSend={sendManualAlert} />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <h2 className="text-xl font-medium mb-2">Live Alerts</h2>
          <div className="h-[460px] overflow-auto border rounded p-3 bg-white/70 text-sm space-y-2">
            {loadingEvents && <div className="text-gray-500">Loading…</div>}
            {!loadingEvents && events.length === 0 && <div className="text-gray-500">No events yet.</div>}
            {events.map((ev, idx) => (
              <div key={idx} className="border-b pb-2">
                <div className="text-xs text-gray-500">{ev.time || '—'}</div>
                <div><b>{ev.type}</b> — {ev.details}</div>
              </div>
            ))}
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
    <div className="flex gap-2">
      <input ref={inputRef} className="flex-1 border rounded px-2 py-1" placeholder="Quick note to log" onKeyDown={(e)=>{ if (e.key === 'Enter') { e.preventDefault(); send() } }} />
      <button className="btn" type="button" onClick={send}>Send</button>
    </div>
  )
}
