import { useCallback, useEffect, useRef, useState } from 'react'
import { Video, VideoOff, Download, Eye, Users, Wifi, WifiOff, AlertTriangle, FileText } from 'lucide-react'
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
  const [endedByInterviewer, setEndedByInterviewer] = useState(false)

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
    if (incoming.type === 'interview-ended') {
      setEndedByInterviewer(true)
    }
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

  useEffect(() => {
    if (endedByInterviewer && camera.streamActive) {
      try { camera.stopCamera() } catch {}
    }
  }, [endedByInterviewer, camera.streamActive])

  const { status } = useDetection({
    videoRef: camera.videoRef,
    canvasRef: camera.canvasRef,
    enabled: camera.streamActive,
    onEvent: handleEvent,
    onStatus: (s) => {
      setLiveStatus(s)
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-green-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 text-white grid place-items-center font-bold text-lg">J</div>
              <div>
                <h1 className="font-bold text-gray-900 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Video Proctoring System
                </h1>
                <p className="text-xs text-gray-600">Live interview session</p>
              </div>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-medium rounded-full">Candidate</span>
            </div>
            <div className="text-sm text-gray-600">
              Session: <code className="bg-gray-100 px-2 py-1 rounded text-xs">{sessionId}</code>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {endedByInterviewer && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-red-700 text-sm">The interviewer has ended the interview. You can close this page now.</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Video Section */}
          <div className="lg:col-span-2 space-y-3">
            {/* Name Input */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 min-w-fit">Name:</label>
                <input 
                  defaultValue={candidateName} 
                  onBlur={(e)=>saveName(e.target.value)} 
                  placeholder="Enter candidate name" 
                  className="flex-1 px-3 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500" 
                />
                <span className="text-xs text-gray-500 hidden sm:block">Recording controlled by interviewer</span>
              </div>
            </div>

            {/* Video Container */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="relative bg-gray-900 aspect-video">
                <video ref={camera.videoRef} className="absolute inset-0 w-full h-full object-contain" playsInline muted></video>
                <canvas ref={camera.canvasRef} className="absolute inset-0 w-full h-full pointer-events-none"></canvas>
                <video ref={remoteVideoRef} className={`absolute top-2 right-2 w-32 h-24 object-cover rounded border-2 border-white ${remoteActive ? '' : 'hidden'}`} playsInline autoPlay muted></video>
                <audio ref={remoteAudioRef} autoPlay playsInline className="hidden"></audio>
                
                {!camera.streamActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-white">
                      <Video className="w-16 h-16 mx-auto mb-2 opacity-50" />
                      <p className="text-sm opacity-75">Camera not active</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Controls */}
              <div className="p-3 border-t bg-gray-50">
                <div className="flex gap-2">
                  {!camera.streamActive ? (
                    <button 
                      onClick={camera.startCamera} 
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium flex items-center gap-2 transition-colors" 
                      disabled={endedByInterviewer}
                    >
                      <Video className="w-4 h-4" />
                      Start Camera
                    </button>
                  ) : (
                    <button 
                      onClick={camera.stopCamera} 
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                      <VideoOff className="w-4 h-4" />
                      Stop Camera
                    </button>
                  )}
                  {camera.recordedUrl && (
                    <a 
                      className="px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded text-sm font-medium flex items-center gap-2 transition-colors" 
                      href={camera.recordedUrl} 
                      download={`recording-${Date.now()}.webm`}
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Status Grid */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Users className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-600">Faces:</span>
                  <span className="font-medium">{status.faces || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-600">Looking:</span>
                  <span className="font-medium">{status.lookingAtScreen ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {interviewerConnected ? <Wifi className="w-3 h-3 text-green-500" /> : <WifiOff className="w-3 h-3 text-red-500" />}
                  <span className="text-gray-600">Interviewer:</span>
                  <span className="font-medium">{interviewerConnected ? 'Connected' : 'Waiting'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Video className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-600">Remote:</span>
                  <span className="font-medium">{remoteActive ? 'On' : 'Off'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Objects:</span>
                  <span className="font-medium text-xs">{status.objectDetections?.length ? status.objectDetections.join(', ') : 'None'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Last detection:</span>
                  <span className="font-medium text-xs">{status.lastDetection || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Report Card */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="p-3 border-b bg-gray-50">
                <h3 className="font-medium text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Report
                </h3>
              </div>
              <div className="p-3">
                <p className="text-sm text-gray-600">The interviewer will generate the report from their screen.</p>
              </div>
            </div>

            {/* Event Log */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="p-3 border-b bg-gray-50">
                <h3 className="font-medium text-gray-900">Event Log</h3>
              </div>
              <div className="h-80 overflow-auto">
                <div className="p-3 space-y-2">
                  {events.length === 0 ? (
                    <div className="text-gray-500 text-sm text-center py-4">No events yet</div>
                  ) : (
                    events.map((e, idx) => (
                      <div key={idx} className="border-b border-gray-100 pb-2 last:border-b-0">
                        <div className="text-xs text-gray-500">{e.time}</div>
                        <div className="text-sm">
                          <span className="font-medium">{e.type}</span>
                          <span className="text-gray-600"> — {e.details}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="p-3 border-t bg-gray-50">
                <p className="text-xs text-gray-500">Rules: not-looking &gt; 5s, no-face &gt; 10s, multiple faces, objects (phone/book)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}