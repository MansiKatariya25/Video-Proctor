import { ensureScript } from './utils.js'


const LEFT_EYE_EAR = [33, 160, 158, 133, 153, 144]
const RIGHT_EYE_EAR = [362, 385, 387, 263, 373, 380]
const EAR_THRESHOLD = 0.25

function isVideoReady(video) {
  if (!video) return false
  const ready = (video.readyState ?? 0) >= 2 // HAVE_CURRENT_DATA
  const w = video.videoWidth || 0
  const h = video.videoHeight || 0
  return ready && w > 0 && h > 0
}

export async function detectFacesWithFaceMesh(video) {
  if (!isVideoReady(video)) return null
  const width = video.videoWidth
  const height = video.videoHeight
  const result = { count: 0, looking: false, boxes: [], landmarks: [], source: 'mediapipe' }
  
  if (!window.FaceMesh) {
    try {
      await ensureScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js')
    } catch {}
  }
  if (!window.FaceMesh) return null
  if (!detectFacesWithFaceMesh.faceMesh) {
    detectFacesWithFaceMesh.faceMesh = new window.FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    })
    detectFacesWithFaceMesh.faceMesh.setOptions({
      maxNumFaces: 4,
      refineLandmarks: true,
      // Slightly lower thresholds to reduce dropouts/flicker
      minDetectionConfidence: 0.3,
      minTrackingConfidence: 0.3,
    })
    await detectFacesWithFaceMesh.faceMesh.initialize?.()
  }
  const fm = detectFacesWithFaceMesh.faceMesh
  let res
  try {
    res = await new Promise((resolve, reject) => {
      try {
        fm.onResults(resolve)
        fm.send({ image: video })
      } catch (err) {
        reject(err)
      }
    })
  } catch (err) {
    console.warn('FaceMesh send failed; will fall back', err)
    return null
  }
  const faces = res?.multiFaceLandmarks || []
  result.count = faces.length
  result.landmarks = faces
  result.boxes = faces.map((lm) => {
    let minX = 1, minY = 1, maxX = 0, maxY = 0
    for (const p of lm) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    return { x: minX * width, y: minY * height, w: (maxX - minX) * width, h: (maxY - minY) * height }
  })
  if (faces.length > 0) {
    const lm = faces[0]
    const left = lm[473]
    const right = lm[468]
    let faceMinX = 1, faceMaxX = 0
    const face = faces[0]

    const leftEAR = calculateEyeAspectRatio(face, LEFT_EYE_EAR, width, height)
    const rightEAR = calculateEyeAspectRatio(face, RIGHT_EYE_EAR, width, height)
    const avgEAR = (leftEAR + rightEAR) / 2

    for (const p of lm) { if (p.x < faceMinX) faceMinX = p.x; if (p.x > faceMaxX) faceMaxX = p.x }
    const faceW = (faceMaxX - faceMinX) * width
    const eyeDist = Math.hypot((left.x - right.x) * width, (left.y - right.y) * height)
    const ratio = eyeDist / Math.max(1, faceW)
    result.looking = ratio >= 0.27
    result.eyeData = {
      leftEAR,
      rightEAR,
      avgEAR,
      eyesClosed: avgEAR < EAR_THRESHOLD,
      drowsinessLevel: Math.max(0, (EAR_THRESHOLD - avgEAR) * 200)
    }
  }
  return result
}

export async function detectFacesWithFaceDetector(video, _canvasIgnored) {
  if (!isVideoReady(video)) return null
  const width = video.videoWidth
  const height = video.videoHeight
  const result = { count: 0, looking: false, boxes: [], landmarks: [], source: 'face-detector' }
  if (!('FaceDetector' in window)) return null
  if (!detectFacesWithFaceDetector.fd) detectFacesWithFaceDetector.fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 })
  const fd = detectFacesWithFaceDetector.fd
  // Use an offscreen canvas so we don't disturb the overlay canvas sizing or contents
  if (!detectFacesWithFaceDetector.workCanvas) detectFacesWithFaceDetector.workCanvas = document.createElement('canvas')
  const work = detectFacesWithFaceDetector.workCanvas
  work.width = width; work.height = height
  const wctx = work.getContext('2d', { willReadFrequently: true })
  wctx.drawImage(video, 0, 0, width, height)
  const detections = await fd.detect(work)
  result.count = detections.length
  result.boxes = detections.map((d) => ({ x: d.boundingBox.x, y: d.boundingBox.y, w: d.boundingBox.width, h: d.boundingBox.height }))
  if (detections[0]) {
    const b = detections[0].boundingBox
    const cx = b.x + b.width / 2
    const centered = Math.abs(cx - width / 2) / (width / 2) < 0.25
    result.looking = centered
  }
  return result
}

// Additional fallback using MediaPipe Face Detection (lightweight boxes)
export async function detectFacesWithMPFaceDetection(video) {
  const width = video.videoWidth
  const height = video.videoHeight
  const result = { count: 0, looking: false, boxes: [], landmarks: [], source: 'mp-face-detection' }
  if (!width || !height) return null
  if (!window.FaceDetection) {
    try {
      await ensureScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js')
    } catch {}
  }
  const FD = window.FaceDetection || window.faceDetection
  if (!FD) return null
  if (!detectFacesWithMPFaceDetection.det) {
    const Ctor = (typeof FD === 'function') ? FD : (FD.FaceDetection || FD.FaceDetector || null)
    if (!Ctor) return null
    const det = new Ctor({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}` })
    det.setOptions({ model: 'short', minDetectionConfidence: 0.4 })
    detectFacesWithMPFaceDetection.det = det
    await det.initialize?.()
  }
  const det = detectFacesWithMPFaceDetection.det
  const res = await new Promise((resolve) => { det.onResults(resolve); det.send({ image: video }) })
  const detections = res.detections || []
  result.count = detections.length
  result.boxes = detections.map((d) => {
    const rb = d.locationData?.relativeBoundingBox || d.relativeBoundingBox || {}
    const x = (rb.xmin || rb.x || 0) * width
    const y = (rb.ymin || rb.y || 0) * height
    const w = (rb.width || 0) * width
    const h = (rb.height || 0) * height
    return { x, y, w, h }
  })
  if (result.boxes[0]) {
    const b = result.boxes[0]
    const cx = b.x + b.w / 2
    const centered = Math.abs(cx - width / 2) / (width / 2) < 0.25
    result.looking = centered
  }
  return result
}

function calculateEyeAspectRatio(landmarks, eyePoints, width, height) {
  const points = eyePoints.map(idx => ({
    x: landmarks[idx].x * width,
    y: landmarks[idx].y * height
  }))
  
  const vertical1 = Math.hypot(points[1].x - points[5].x, points[1].y - points[5].y)
  const vertical2 = Math.hypot(points[2].x - points[4].x, points[2].y - points[4].y)
  const horizontal = Math.hypot(points[0].x - points[3].x, points[0].y - points[3].y)
  
  return (vertical1 + vertical2) / (2.0 * horizontal)
}
