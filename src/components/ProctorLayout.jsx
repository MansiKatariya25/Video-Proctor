import { useCallback, useEffect, useRef, useState } from 'react'
import useSession from '../hooks/useSession.js'
import useCamera from '../hooks/useCamera.js'
import useDetection from '../hooks/useDetection.js'
import { nowISO } from '../lib/utils.js'
import useWebRTC from '../hooks/useWebRTC.js'
import api from '../lib/axios.js'

export default function ProctorLayout() {
  const { sessionId, candidateName, saveName, markStart, markEnd, fetchReport } = useSession()
  const [events, setEvents] = useState([])
  const [report, setReport] = useState(null)
  const [copied, setCopied] = useState(false)
  const [remoteActive, setRemoteActive] = useState(false)
  const remoteVideoRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const [liveStatus, setLiveStatus] = useState(null)

  const handleRemoteStream = useCallback(({ stream }) => {
    setRemoteActive(Boolean(stream))
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream || null
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream || null
      if (stream) remoteAudioRef.current.play().catch(() => {})
    }
  }, [])

  const handleIncomingEvent = useCallback((incoming) => {
    if (!incoming) return
    setEvents((prev) => [incoming, ...prev])
  }, [])

  const { setLocalStream, sendEvent, connected: interviewerConnected } = useWebRTC({
    sessionId,
    role: 'candidate',
    onRemoteStream: handleRemoteStream,
    onEvent: handleIncomingEvent,
  })

  const handleEvent = useCallback((type, details, extra = {}) => {
    const ev = { time: nowISO(), type, details, sessionId, ...extra }
    setEvents((prev) => [ev, ...prev])
    api.post('/api/events', ev).catch(()=>{})
    sendEvent(ev)
  }, [sendEvent, sessionId])

  const camera = useCamera({ onEvent: handleEvent, sessionId })
  const { status } = useDetection({
    videoRef: camera.videoRef,
    canvasRef: camera.canvasRef,
    enabled: camera.streamActive,
    onEvent: handleEvent,
    onStatus: (s) => {
      setLiveStatus(s)
      // Broadcast a lightweight status event to viewers
      sendEvent({ type: 'live-status', ...s, sessionId })
    }
  })

  useEffect(() => { if (camera.streamActive) markStart(); else markEnd() }, [camera.streamActive])

  useEffect(() => {
    if (camera.streamActive && camera.streamRef?.current) {
      setLocalStream(camera.streamRef.current)
    } else if (!camera.streamActive) {
      setLocalStream(null)
    }
  }, [camera.streamActive, camera.streamRef, setLocalStream])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-semibold mb-4">Video Proctoring System</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-col sm:flex-row gap-2 items-start sm:items-end">
            <label className="text-sm">
              Candidate Name
              <input defaultValue={candidateName} onBlur={(e)=>saveName(e.target.value)} placeholder="Enter candidate name" className="ml-2 px-2 py-1 border rounded" />
            </label>
            <button className="btn" onClick={async ()=>{ const r = await fetchReport(); setReport(r) }}>Generate Report</button>
          </div>
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden shadow">
            <video ref={camera.videoRef} className="absolute inset-0 w-full h-full object-contain z-0" playsInline muted></video>
            <canvas ref={camera.canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10"></canvas>
            <video ref={remoteVideoRef} className={`absolute top-3 right-3 w-40 h-28 rounded border border-white/60 shadow-lg bg-black/80 z-20 ${remoteActive ? '' : 'hidden'}`} playsInline autoPlay muted></video>
            <audio ref={remoteAudioRef} autoPlay playsInline className="hidden"></audio>
            {/* Removed duplicate bottom-left status; canvas overlay already shows top-left HUD */}
          </div>
          <div className="flex gap-2 mt-4">
            {!camera.streamActive ? (
              <button onClick={camera.startCamera} className="btn">Start Camera</button>
            ) : (
              <button onClick={camera.stopCamera} className="btn-secondary">Stop Camera</button>
            )}
            {!camera.recording ? (
              <button onClick={camera.startRecording} className="btn" disabled={!camera.streamActive}>Start Recording</button>
            ) : (
              <button onClick={camera.stopRecording} className="btn-danger">Stop Recording</button>
            )}
            {camera.recordedUrl && (
              <a className="btn-outline" href={camera.recordedUrl} download={`recording-${Date.now()}.webm`}>Download Recording</a>
            )}
          </div>

          <div className="mt-4 text-sm text-gray-600 grid grid-cols-2 gap-2">
            <div>Faces: <b>{status.faces}</b></div>
            <div>Looking at screen: <b>{status.lookingAtScreen ? 'Yes' : 'No'}</b></div>
            <div>Last detection: {status.lastDetection || 'N/A'}</div>
            <div>Objects: {status.objectDetections.length ? status.objectDetections.join(', ') : 'N/A'}</div>
            <div>Interviewer: <b>{interviewerConnected ? 'Connected' : 'Waiting'}</b></div>
            <div>Remote stream: <b>{remoteActive ? 'On' : 'Off'}</b></div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <h2 className="text-xl font-medium mb-2">Report</h2>
          <div className="mb-4 border rounded p-3 bg-white/70 text-sm space-y-1">
            {!report ? (
              <div className="text-gray-500">Click Generate Report to compute summary.</div>
            ) : (
              <>
                <div>Candidate: <b>{report.candidateName || 'N/A'}</b></div>
                <div>Session: <code className="text-xs">{report.sessionId}</code></div>
                <div>Interview Duration: <b>{report.interviewDuration}</b></div>
                <div>Focus lost: <b>{report.counts.focusLost}</b></div>
                <div>Suspicious: multiple faces <b>{report.counts.multipleFaces}</b>, no face <b>{report.counts.noFace}</b>, phone <b>{report.counts.phoneDetected}</b>, notes <b>{report.counts.notesDetected}</b></div>
                <div>Eye/Mic: eyes closed <b>{report.counts.eyesClosed ?? 0}</b>, drowsiness <b>{report.counts.drowsiness ?? 0}</b>, voices <b>{report.counts.backgroundVoices ?? 0}</b></div>
                <div>Final Integrity Score: <b>{report.integrity.score}</b>/100</div>
                <hr className="my-2" />
                <div className="font-medium">Formatted Proctoring Report</div>
                <pre className="whitespace-pre-wrap bg-white/60 p-2 rounded border text-xs">
{buildReportText(report)}
                </pre>
                <div className="flex gap-2">
                  <button className="btn-outline" onClick={async ()=>{ await navigator.clipboard.writeText(buildReportText(report)); setCopied(true); setTimeout(()=>setCopied(false), 1500) }}>{copied ? 'Copied' : 'Copy Text'}</button>
                  <a className="btn-outline" href={`data:text/plain;charset=utf-8,${encodeURIComponent(buildReportText(report))}`} download={`proctoring-report-${report.sessionId}.txt`}>Download .txt</a>
                </div>
              </>
            )}
          </div>

          <h2 className="text-xl font-medium mb-2">Event Log</h2>
          <div className="h-[420px] overflow-auto border rounded p-2 bg-white/60">
            {events.length === 0 && <div className="text-gray-500">No events yet…</div>}
            {events.map((e, idx) => (
              <div key={idx} className="border-b py-1">
                <div className="text-xs text-gray-500">{e.time}</div>
                <div className="text-sm"><b>{e.type}</b> — {e.details}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Rules: not-looking &gt; 5s, no-face &gt; 10s, multiple faces, objects (phone/book).
          </div>
        </div>
      </div>
    </div>
  )
}

function buildReportText(report) {
  if (!report) return ''
  const d = report.counts || {}
  const w = report.integrity?.weights || {}
  const caps = report.integrity?.caps || {}
  const ded = report.integrity?.deductions || {}

  const lines = []
  lines.push('Proctoring Report')
  lines.push(`Candidate Name: ${report.candidateName || 'N/A'}`)
  lines.push(`Interview Duration: ${report.interviewDuration || '00:00:00'}`)
  lines.push(`Number of times focus lost: ${d.focusLost ?? 0}`)
  lines.push(`Suspicious events: multiple faces ${d.multipleFaces ?? 0}, absence ${d.noFace ?? 0}, phone ${d.phoneDetected ?? 0}, notes ${d.notesDetected ?? 0}`)
  lines.push(`Eye/Mic events: eyes closed ${d.eyesClosed ?? 0}, drowsiness ${d.drowsiness ?? 0}, voices ${d.backgroundVoices ?? 0}`)

  const parts = [
    formatDeductionFlat('focus', d.focusLost, w.focusLoss, caps.focusLoss, ded.focusLoss),
    formatDeductionFlat('no face', d.noFace, w.noFace, caps.noFace, ded.noFace),
    formatDeductionFlat('multiple faces', d.multipleFaces, w.multipleFaces, caps.multipleFaces, ded.multipleFaces),
    formatDeductionFlat('phone', d.phoneDetected, w.phone, caps.phone, ded.phone),
    formatDeductionFlat('notes', d.notesDetected, w.notes, caps.notes, ded.notes),
    formatDeductionFlat('eyes closed', d.eyesClosed, w.eyesClosed, caps.eyesClosed, ded.eyesClosed),
    formatDeductionFlat('drowsiness', d.drowsiness, w.drowsiness, caps.drowsiness, ded.drowsiness),
    formatDeductionFlat('background voices', d.backgroundVoices, w.backgroundVoices, caps.backgroundVoices, ded.backgroundVoices),
  ]
  const total = Object.values(ded).reduce((a, b) => a + Number(b || 0), 0)
  lines.push(`Final Integrity Score = 100 - (${parts.join(' + ')}) = ${report.integrity?.score ?? Math.max(0, 100 - total)}`)
  return lines.join('\n')
}

function formatDeductionFlat(label, count=0, wt=0, cap=Infinity, applied=undefined) {
  const flat = (Number(count||0) > 0) ? Number(wt||0) : 0
  const capped = Math.min(flat, Number.isFinite(cap) ? cap : flat)
  const final = applied !== undefined ? applied : capped
  return `${label}: ${final}`
}

