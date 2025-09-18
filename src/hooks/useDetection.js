import { useEffect, useRef, useState } from 'react'
import { nowISO } from '../lib/utils.js'
import { detectFacesWithFaceMesh, detectFacesWithFaceDetector, detectFacesWithMPFaceDetection } from '../lib/mediapipe.js'
import { detectYOLO } from '../lib/yolo.js'

const DBG = String(import.meta.env.VITE_YOLO_DEBUG || 'false').toLowerCase() === 'true'
const DISABLE_FACEMESH = String(import.meta.env.VITE_DISABLE_FACEMESH || 'false').toLowerCase() === 'true'

export default function useDetection({ videoRef, canvasRef, enabled, onEvent, onStatus }) {
  const processingRef = useRef(false)
  const animationFrameRef = useRef(null)
  const faceStateRef = useRef({ lastFaceTime: 0, lastFocusFalseTime: 0, focusLogged: false, noFaceLogged: false, multiFaceLogged: false })
  const lastFacesRef = useRef({ info: null, ts: 0 })
  const persistentFacesRef = useRef({ info: null, ts: 0 }) // Longer persistence
  const lastObjectsRef = useRef([])
  const lastObjectDetectionTime = useRef(0)
  const eyeStateRef = useRef({
    closedFrameCount: 0,
    drowsyFrameCount: 0,
    lastEAR: 1.0
  })
  const audioContextRef = useRef(null)
  const audioInitRef = useRef(false)
  const lastAudioAlertRef = useRef(0)
  const audioDataRef = useRef({ volume: 0, multipleVoices: false })
  const [audioData, setAudioData] = useState({ volume: 0, multipleVoices: false })
  const [status, setStatus] = useState({ faces: 0, lookingAtScreen: false, lastDetection: '', objectDetections: [] })
  const [objects, setObjects] = useState([])
  const lastStatusSentRef = useRef(0)

  // Move processEyeData inside the hook so it has access to eyeStateRef
  const processEyeData = (eyeData, onEvent) => {
    const eyeState = eyeStateRef.current
    
    if (eyeData.eyesClosed) {
      eyeState.closedFrameCount++
      
      // Eyes closed alert (after ~0.5 seconds)
      if (eyeState.closedFrameCount === 15) {
        onEvent?.('eyes-closed', 'Eyes have been closed for extended period')
      }
      
      // Drowsiness alert (after ~1 second)  
      eyeState.drowsyFrameCount++
      if (eyeState.drowsyFrameCount === 30) {
        onEvent?.('drowsiness-detected', `Drowsiness level: ${eyeData.drowsinessLevel}`)
      }
    } else {
      eyeState.closedFrameCount = 0
      eyeState.drowsyFrameCount = Math.max(0, eyeState.drowsyFrameCount - 1)
    }
  }

  const initializeAudio = async () => {
    try {
      if (audioInitRef.current) return
      // Prefer existing stream if camera started; else ask for mic only
      let stream = videoRef.current?.srcObject
      if (!(stream && stream.getAudioTracks().length)) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      }
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      const analyser = audioContextRef.current.createAnalyser()
      
      analyser.fftSize = 2048
      source.connect(analyser)
      
      // Simple audio analysis
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      
      const analyzeAudio = () => {
        if (!enabled) return
        
        analyser.getByteFrequencyData(dataArray)
        const volume = dataArray.reduce((sum, val) => sum + val, 0) / bufferLength
        
        // Simple multiple voice detection
        const peaks = dataArray.filter((val, i) => 
          val > 50 && val > dataArray[i-1] && val > dataArray[i+1]
        ).length
        
        const newAudio = { volume, multipleVoices: peaks > 3 }
        audioDataRef.current = newAudio
        setAudioData(newAudio)
        
        // Rate-limit voice alerts to avoid spam
        if (peaks > 3) {
          const now = performance.now()
          if (now - lastAudioAlertRef.current > 3000) {
            lastAudioAlertRef.current = now
            onEvent?.('background-voices', `Multiple voices detected (${peaks} peaks)`)
          }
        }
        
        setTimeout(analyzeAudio, 100) // 10fps analysis
      }
      
      analyzeAudio()
      audioInitRef.current = true
    } catch (error) {
      console.warn('Audio detection failed:', error)
    }
  }

  // Separate continuous drawing loop
  const drawLoop = useRef(null)
  
  useEffect(() => {
    if (!enabled) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      if (drawLoop.current) {
        cancelAnimationFrame(drawLoop.current)
        drawLoop.current = null
      }
      return
    }

    // Initialize audio analysis once, after camera/mic permission
    initializeAudio()

    let lastDetectionTime = 0
    
    // Continuous drawing function - runs at ~60fps
    const continuousDraw = () => {
      const canvas = canvasRef.current
      const video = videoRef.current
      
      if (canvas && video) {
        const nowT = performance.now()
        
        // Determine what faces to draw (with persistence)
        let facesToDraw = null
        if (persistentFacesRef.current.info && (nowT - persistentFacesRef.current.ts) < 2000) {
          facesToDraw = persistentFacesRef.current.info
        } else if (lastFacesRef.current.info && (nowT - lastFacesRef.current.ts) < 500) {
          facesToDraw = lastFacesRef.current.info
        } else {
          facesToDraw = { count: 0, looking: false, boxes: [] }
        }
        
        // Draw the overlay (include audio data)
        drawOverlay(canvas, video, facesToDraw, lastObjectsRef.current, audioDataRef.current)
      }
      
      drawLoop.current = requestAnimationFrame(continuousDraw)
    }
    
    // Detection analysis function - runs less frequently
    const analyze = async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      
      if (!video || !canvas) { 
        animationFrameRef.current = requestAnimationFrame(analyze)
        return 
      }
      
      const nowMs = performance.now()
      
      // Skip if processing or too soon since last detection
      if (processingRef.current || (nowMs - lastDetectionTime) < 100) {
        animationFrameRef.current = requestAnimationFrame(analyze)
        return
      }
      
      try {
        processingRef.current = true
        lastDetectionTime = nowMs
        
        // Face detection
        let facesInfo = null
        if (!DISABLE_FACEMESH) {
          const fm = await detectFacesWithFaceMesh(video)
          facesInfo = fm
        }
        
        // Process eye data if available
        if (facesInfo?.eyeData) {
          processEyeData(facesInfo.eyeData, onEvent)
        }
        
        if (!facesInfo || Number(facesInfo.count || 0) === 0) {
          // Try MediaPipe Face Detection (boxes only)
          const mpfd = await detectFacesWithMPFaceDetection(video)
          facesInfo = mpfd || facesInfo
        }
        if (!facesInfo || Number(facesInfo.count || 0) === 0) {
          // Finally, try the Shape Detection API FaceDetector, if available
          const fd = await detectFacesWithFaceDetector(video, canvas)
          facesInfo = fd || facesInfo || { count: 0, looking: false, boxes: [] }
        }

        // Update face references for drawing
        if (facesInfo && Array.isArray(facesInfo.boxes) && facesInfo.boxes.length > 0) {
          lastFacesRef.current = { info: { ...facesInfo }, ts: nowMs }
          persistentFacesRef.current = { info: { ...facesInfo }, ts: nowMs }
          
          if (DBG) console.debug('[Detect] Valid faces detected:', facesInfo.count, 'boxes:', facesInfo.boxes.length)
        }
        
        // Update status
        setStatus((s) => ({ ...s, faces: facesInfo.count, lookingAtScreen: facesInfo.looking, lastDetection: nowISO(), objectDetections: s.objectDetections }))

        // Throttle and emit live status without persisting
        if (typeof onStatus === 'function') {
          const tNow = performance.now()
          if (tNow - lastStatusSentRef.current > 500) {
            lastStatusSentRef.current = tNow
            onStatus({
              time: nowISO(),
              faces: facesInfo.count,
              lookingAtScreen: !!facesInfo.looking,
              eye: facesInfo.eyeData ? {
                avgEAR: facesInfo.eyeData.avgEAR,
                eyesClosed: !!facesInfo.eyeData.eyesClosed,
                drowsinessLevel: facesInfo.eyeData.drowsinessLevel,
              } : null,
            })
          }
        }

        // Face state tracking for events
        const faceState = faceStateRef.current
        const t = performance.now()
        
        if (facesInfo.count === 0) {
          if (faceState.lastFaceTime === 0) faceState.lastFaceTime = t
          const elapsed = (t - faceState.lastFaceTime) / 1000
          if (elapsed > 10 && !faceState.noFaceLogged) { 
            onEvent?.('no-face-10s', 'No face detected for > 10s')
            faceState.noFaceLogged = true 
          }
        } else { 
          faceState.lastFaceTime = 0
          faceState.noFaceLogged = false 
        }

        if (facesInfo.count >= 2 && !faceState.multiFaceLogged) { 
          onEvent?.('multiple-faces', `Detected ${facesInfo.count} faces in frame`)
          faceState.multiFaceLogged = true 
        }
        if (facesInfo.count < 2) faceState.multiFaceLogged = false

        if (!facesInfo.looking) {
          if (faceState.lastFocusFalseTime === 0) faceState.lastFocusFalseTime = t
          const elapsed = (t - faceState.lastFocusFalseTime) / 1000
          if (elapsed > 5 && !faceState.focusLogged) { 
            onEvent?.('not-looking-5s', 'Candidate not looking at screen > 5s')
            faceState.focusLogged = true 
          }
        } else { 
          faceState.lastFocusFalseTime = 0
          faceState.focusLogged = false 
        }

        // Object detection (less frequent)
        if (nowMs - lastObjectDetectionTime.current > 1000) {
          lastObjectDetectionTime.current = nowMs
          try {
            const objs = await detectYOLO(video)
            if (objs && Array.isArray(objs)) {
              setObjects(objs)
              lastObjectsRef.current = [...objs]
              const names = objs.map(o => o.label)
              setStatus((s) => ({ ...s, objectDetections: names }))
              
              if (DBG) console.debug('[Detect] objects', { count: objs.length, names })
              
              const suspicious = objs.filter((o) => /cell ?phone|mobile|book|notebook|laptop|keyboard|mouse|remote|tv|tablet|ipad|earphone|headphone|monitor|screen/i.test(o.label))
              if (suspicious.length) {
                onEvent?.('object-detected', suspicious.map((o) => `${o.label} ${(o.confidence*100).toFixed(0)}%`).join(', '), { objects: suspicious.map(o=>o.label) })
              }
            }
          } catch (error) {
            if (DBG) console.warn('[Detect] YOLO error:', error)
          }
        }
        
      } catch (error) {
        if (DBG) console.error('[Detect] Analysis error:', error)
      } finally {
        processingRef.current = false
      }
      
      animationFrameRef.current = requestAnimationFrame(analyze)
    }

    // Start both loops
    drawLoop.current = requestAnimationFrame(continuousDraw)
    animationFrameRef.current = requestAnimationFrame(analyze)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      if (drawLoop.current) {
        cancelAnimationFrame(drawLoop.current)
        drawLoop.current = null
      }
    }
  }, [enabled])

  return { status, eyeData: eyeStateRef.current, objects }
}

function drawOverlay(canvas, video, facesInfo, objects, audioData={ volume: 0, multipleVoices: false }) {
  if (!canvas || !video) return
  
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return

  // Set up canvas
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const cw = rect.width
  const ch = rect.height
  
  // Only resize if dimensions changed to avoid flickering
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr)
    canvas.height = Math.round(ch * dpr)
  }
  
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cw, ch)

  // Compute display mapping for object-contain scaling
  const scaleX = cw / vw
  const scaleY = ch / vh
  const scale = Math.min(scaleX, scaleY)
  const dx = (cw - vw * scale) / 2
  const dy = (ch - vh * scale) / 2

  // Draw status panel
  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
  ctx.fillRect(5, 5, 260, 78)
  ctx.fillStyle = '#00ff00'
  ctx.font = 'bold 13px monospace'
  ctx.fillText(`Faces: ${facesInfo?.count || 0}`, 15, 24)
  ctx.fillText(`Looking: ${facesInfo?.looking ? 'YES' : 'NO'}`, 15, 42)
  // Eye/drowsiness info if available
  if (facesInfo?.eyeData) {
    const ear = facesInfo.eyeData.avgEAR?.toFixed(3)
    const drowsy = facesInfo.eyeData.eyesClosed ? 'CLOSED' : 'OPEN'
    ctx.fillText(`EAR: ${ear} (${drowsy})`, 15, 60)
  }
  // Audio info
  const vol = Math.min(1, (audioData?.volume || 0) / 128)
  const volBarW = Math.round(vol * 100)
  ctx.fillText(`Audio: ${audioData?.multipleVoices ? 'MULTI' : 'OK'}`, 140, 24)
  ctx.strokeStyle = '#0af'
  ctx.strokeRect(140, 34, 110, 10)
  ctx.fillStyle = '#0af'
  ctx.fillRect(140, 34, volBarW, 10)
  ctx.restore()

  // Draw face detection boxes
  if (facesInfo?.boxes && Array.isArray(facesInfo.boxes)) {
    ctx.save()
    ctx.strokeStyle = '#00ff00'
    ctx.lineWidth = 3
    ctx.shadowColor = 'rgba(0, 255, 0, 0.5)'
    ctx.shadowBlur = 5
    
    facesInfo.boxes.forEach((box, index) => {
      if (box && typeof box.x === 'number' && typeof box.y === 'number') {
        const x = dx + (box.x * scale)
        const y = dy + (box.y * scale)
        const w = box.w * scale
        const h = box.h * scale
        
        // Main rectangle
        ctx.strokeRect(x, y, w, h)
        
        // Corner markers for better visibility
        const cornerLen = Math.min(20, w * 0.2, h * 0.2)
        ctx.lineWidth = 4
        
        // Draw corners
        ctx.beginPath()
        // Top-left
        ctx.moveTo(x, y + cornerLen)
        ctx.lineTo(x, y)
        ctx.lineTo(x + cornerLen, y)
        // Top-right  
        ctx.moveTo(x + w - cornerLen, y)
        ctx.lineTo(x + w, y)
        ctx.lineTo(x + w, y + cornerLen)
        // Bottom-right
        ctx.moveTo(x + w, y + h - cornerLen)
        ctx.lineTo(x + w, y + h)
        ctx.lineTo(x + w - cornerLen, y + h)
        // Bottom-left
        ctx.moveTo(x + cornerLen, y + h)
        ctx.lineTo(x, y + h)
        ctx.lineTo(x, y + h - cornerLen)
        ctx.stroke()
        
        // Face index label
        ctx.fillStyle = 'rgba(0, 255, 0, 0.8)'
        ctx.fillRect(x, y - 25, 40, 20)
        ctx.fillStyle = '#000'
        ctx.font = '12px monospace'
        ctx.fillText(`F${index + 1}`, x + 5, y - 10)
      }
    })
    ctx.restore()
  }

  // Draw object detection boxes
  if (objects && Array.isArray(objects) && objects.length > 0) {
    ctx.save()
    objects.forEach((obj, index) => {
      if (obj?.box) {
        const { x, y, w, h } = obj.box
        const rx = dx + (x * scale)
        const ry = dy + (y * scale)
        const rw = w * scale
        const rh = h * scale
        
        // Object box
        ctx.strokeStyle = '#ff6600'
        ctx.lineWidth = 2
        ctx.strokeRect(rx, ry, rw, rh)
        
        // Label
        const label = `${obj.label} ${Math.round(obj.confidence * 100)}%`
        ctx.font = '12px monospace'
        const textWidth = ctx.measureText(label).width
        const labelY = Math.max(15, ry - 5)
        
        ctx.fillStyle = 'rgba(255, 102, 0, 0.9)'
        ctx.fillRect(rx, labelY - 15, textWidth + 8, 18)
        ctx.fillStyle = '#fff'
        ctx.fillText(label, rx + 4, labelY - 2)
      }
    })
    ctx.restore()
  }
}
