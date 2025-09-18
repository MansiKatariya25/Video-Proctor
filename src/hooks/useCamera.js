import { useRef, useState } from 'react'

export default function useCamera({ onEvent, sessionId }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const [streamActive, setStreamActive] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordedUrl, setRecordedUrl] = useState('')
  const streamRef = useRef(null)

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
    const video = videoRef.current
    video.srcObject = stream
    await video.play().catch(()=>{})
    // Ensure metadata loaded so videoWidth/videoHeight are available
    if (!video.videoWidth || !video.videoHeight) {
      await new Promise((resolve) => {
        const onMeta = () => { video.removeEventListener('loadedmetadata', onMeta); resolve() }
        video.addEventListener('loadedmetadata', onMeta)
      })
    }
    setStreamActive(true)
    streamRef.current = stream
    onEvent?.('camera-started', 'User media stream acquired')
  }

  const stopCamera = () => {
    const video = videoRef.current
    const stream = video?.srcObject
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      video.srcObject = null
    }
    setStreamActive(false)
    streamRef.current = null
    onEvent?.('camera-stopped', 'User media stream stopped')
  }

  const startRecording = () => {
    const stream = streamRef.current || videoRef.current?.srcObject
    if (!stream) throw new Error('Camera stream not active')
    recordedChunksRef.current = []
    const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' })
    mediaRecorderRef.current = mr
    mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data) }
    mr.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      setRecordedUrl(url)
      onEvent?.('recording-saved', `Size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)
      try { await uploadRecording(blob, sessionId); } catch {}
    }
    mr.start(1000)
    setRecording(true)
    onEvent?.('recording-started', 'MediaRecorder started')
  }

  const stopRecording = () => {
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') {
      mr.stop()
      setRecording(false)
      onEvent?.('recording-stopped', 'MediaRecorder stopped')
    }
  }

  return { videoRef, canvasRef, streamActive, startCamera, stopCamera, recording, startRecording, stopRecording, recordedUrl, streamRef }
}

async function uploadRecording(blob, sessionId) {
  const form = new FormData()
  form.append('file', blob, `recording-${Date.now()}.webm`)
  form.append('sessionId', sessionId)
  const res = await fetch('/api/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
}
