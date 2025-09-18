import { ensureScript, COCO_LABELS } from './utils.js'

const MODEL_URL = import.meta.env.VITE_YOLO_MODEL_URL
const INPUT_SIZE = Number(import.meta.env.VITE_YOLO_INPUT || 640)
const SCORE_THRESH = Number(import.meta.env.VITE_YOLO_SCORE || 0.35)
const DECODE_THRESH = Number(import.meta.env.VITE_YOLO_DECODE_THRESH || Math.min(0.2, SCORE_THRESH))
const NMS_IOU = Number(import.meta.env.VITE_YOLO_NMS_IOU || 0.45)
const OUTPUT_LAYOUT = (import.meta.env.VITE_YOLO_OUTPUT_LAYOUT || 'nms').toLowerCase()
const EP_ORDER = (import.meta.env.VITE_YOLO_EP || 'webgpu,webgl,wasm').split(',').map(s=>s.trim())
const TARGETS = (import.meta.env.VITE_YOLO_TARGETS || 'cell phone,book,laptop,keyboard,mouse,remote,tv,tablet,monitor').split(',').map(s=>s.trim().toLowerCase())
const DBG = String(import.meta.env.VITE_YOLO_DEBUG || 'false').toLowerCase() === 'true'
const CLASS_THRESH = parseClassThresholds(import.meta.env.VITE_YOLO_CLASS_THRESH)

let session = null
let io = { inputName: 'images', outputName: null }
let chosenEP = null
let expectedSize = null
let labels = COCO_LABELS
let warmupDone = false

// Caching for performance
const tensorCache = new Map()
const canvasCache = { canvas: null, ctx: null, size: null }

// Performance monitoring
let perfStats = { 
  totalRuns: 0, 
  totalTime: 0, 
  avgTime: 0,
  lastDetections: 0,
  errors: 0
}

export async function initYOLO() {
  if (!MODEL_URL) return false
  
  if (DBG) console.info('[YOLO] init with model', MODEL_URL, { 
    INPUT_SIZE, OUTPUT_LAYOUT, EP_ORDER, SCORE_THRESH, NMS_IOU, CLASS_THRESH 
  })

  // Preflight check with better error handling
  if (DBG) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const head = await fetch(MODEL_URL, { 
        method: 'HEAD',
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      const size = head.headers.get('content-length')
      console.info('[YOLO] model HEAD', head.status, head.ok ? 'OK' : 'NOT OK', 
        size ? `${(Number(size) / 1024 / 1024).toFixed(1)}MB` : 'unknown size')
    } catch (e) {
      console.warn('[YOLO] HEAD fetch failed (may still load via ORT):', e.message)
    }
  }

  // Load ONNX Runtime
  if (!window.ort) {
    if (DBG) console.info('[YOLO] loading onnxruntime-web script')
    await ensureScript('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js')
    
    // Configure ORT for better performance
    if (window.ort) {
      window.ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 8)
      window.ort.env.wasm.simd = true
      if (DBG) console.info('[YOLO] ORT configured', {
        threads: window.ort.env.wasm.numThreads,
        simd: window.ort.env.wasm.simd
      })
    }
  }

  if (!session) {
    // Try providers in order with better error handling
    for (const ep of EP_ORDER) {
      try {
        // Check availability first
        if (ep === 'webgpu' && !('gpu' in navigator)) {
          if (DBG) console.info('[YOLO] WebGPU not available, skipping')
          continue
        }
        if (ep === 'webgl' && !window.WebGLRenderingContext) {
          if (DBG) console.info('[YOLO] WebGL not available, skipping')
          continue
        }

        if (DBG) console.info('[YOLO] creating session with EP', ep)
        
        const sessionOptions = {
          executionProviders: [ep],
          graphOptimizationLevel: 'all',
          executionMode: 'sequential',
          enableCpuMemArena: true,
          enableMemPattern: true,
          logSeverityLevel: DBG ? 2 : 4
        }

        // Add EP-specific options
        if (ep === 'webgpu') {
          sessionOptions.enableProfiling = false
        } else if (ep === 'webgl') {
          sessionOptions.webgl = {
            contextId: 'webgl2',
            matmulMaxBatchSize: 16,
            textureCacheMode: 'full'
          }
        }

        session = await window.ort.InferenceSession.create(MODEL_URL, sessionOptions)
        chosenEP = ep
        if (DBG) console.info('[YOLO] session created successfully with', ep)
        break
      } catch (e) {
        if (DBG) console.warn('[YOLO] EP failed, trying next', ep, e.message)
      }
    }

    if (!session) {
      if (DBG) console.info('[YOLO] falling back to WASM')
      session = await window.ort.InferenceSession.create(MODEL_URL, { 
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      })
      chosenEP = 'wasm'
    }

    // Cache IO metadata
    try {
      const inNames = session.inputNames || Object.keys(session.inputMetadata || {})
      const outNames = session.outputNames || Object.keys(session.outputMetadata || {})
      if (inNames && inNames.length) io.inputName = inNames[0]
      if (outNames && outNames.length) io.outputName = outNames[0]
      
      if (DBG) {
        console.info('[YOLO] IO', { input: io.inputName, output: io.outputName, chosenEP })
        console.info('[YOLO] inputMetadata', session.inputMetadata)
        console.info('[YOLO] outputMetadata', session.outputMetadata)
      }

      // Infer expected input size from model
      const meta = session.inputMetadata?.[io.inputName]
      const dims = meta?.dimensions || meta?.dims
      if (Array.isArray(dims) && dims.length === 4 && Number.isFinite(dims[2]) && Number.isFinite(dims[3])) {
        expectedSize = dims[2]
        if (DBG) console.info('[YOLO] inferred expected input size from model:', expectedSize)
      }
    } catch (e) {
      console.warn('[YOLO] Failed to read model metadata:', e.message)
    }
  }
  
  return true
}

function letterbox(video, size) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  const scale = Math.min(size / vw, size / vh)
  const nw = Math.round(vw * scale)
  const nh = Math.round(vh * scale)
  const dx = Math.floor((size - nw) / 2)
  const dy = Math.floor((size - nh) / 2)

  // Use cached canvas for better performance
  if (!canvasCache.canvas || canvasCache.size !== size) {
    canvasCache.canvas = document.createElement('canvas')
    canvasCache.ctx = canvasCache.canvas.getContext('2d', {
      alpha: false,
      willReadFrequently: false
    })
    canvasCache.size = size
  }

  const canvas = canvasCache.canvas
  const ctx = canvasCache.ctx
  
  canvas.width = size
  canvas.height = size
  
  // Clear with black background
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)
  
  // Draw video frame
  ctx.drawImage(video, 0, 0, vw, vh, dx, dy, nw, nh)
  
  const img = ctx.getImageData(0, 0, size, size)

  // Optimize tensor creation with cached array if possible
  const tensorKey = `${size}_tensor`
  let chw = tensorCache.get(tensorKey)
  if (!chw) {
    chw = new Float32Array(size * size * 3)
    tensorCache.set(tensorKey, chw)
  }

  // Convert to CHW format [0,1] normalized
  const channelSize = size * size
  const data = img.data
  
  // Optimized conversion loop
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    chw[p] = data[i] / 255.0                    // R
    chw[p + channelSize] = data[i + 1] / 255.0  // G  
    chw[p + 2 * channelSize] = data[i + 2] / 255.0 // B
  }

  const tensor = new window.ort.Tensor('float32', chw, [1, 3, size, size])
  
  return { tensor, scale, dx, dy, nw, nh, size, vw, vh }
}

export async function detectYOLO(video) {
  if (!MODEL_URL) return []
  
  if (!session) {
    const ok = await initYOLO()
    if (!ok) return []
  }

  const t0 = performance.now()
  perfStats.totalRuns++
  
  try {
    const inputSize = expectedSize || INPUT_SIZE
    const letter = letterbox(video, inputSize)
    if (!letter) return []

    // Warmup run for better performance measurement
    if (!warmupDone && perfStats.totalRuns === 1) {
      if (DBG) console.info('[YOLO] performing warmup run')
      try {
        await session.run({ [io.inputName]: letter.tensor })
        warmupDone = true
        if (DBG) console.info('[YOLO] warmup completed')
      } catch (e) {
        console.warn('[YOLO] warmup failed, continuing:', e.message)
      }
    }

    const feeds = { [io.inputName]: letter.tensor }
    if (DBG && perfStats.totalRuns <= 3) {
      console.info('[YOLO] run start', { 
        inputName: io.inputName, 
        chosenEP, 
        inputSize,
        tensorShape: letter.tensor.dims
      })
    }

    let output
    try {
      output = await session.run(feeds)
    } catch (e) {
      console.error('[YOLO] session.run failed', e.message)
      perfStats.errors++
      
      // Try size recovery
      const exp = parseExpectedSizeFromError(e)
      if (exp && exp !== letter.size) {
        if (DBG) console.warn('[YOLO] retrying with expected size from error:', exp)
        expectedSize = exp
        const newLetter = letterbox(video, exp)
        if (newLetter) {
          output = await session.run({ [io.inputName]: newLetter.tensor })
          Object.assign(letter, newLetter) // Update letter with new dimensions
        } else {
          throw e
        }
      } else {
        throw e
      }
    }

    const outNames = Object.keys(output)
    const outFirst = output[io.outputName || outNames[0]]
    const data = outFirst.data
    let dets = []

    // Enhanced detection parsing with better error handling
    if (OUTPUT_LAYOUT === 'nms') {
      dets = parseNMSOutput(outFirst, data, letter)
    } else if (OUTPUT_LAYOUT === 'v8') {
      dets = parseV8Output(outFirst, data, letter)
    } else if (OUTPUT_LAYOUT === 'v3') {
      const tensors = outNames.map((k) => output[k])
      if (DBG) console.info('[YOLO] v3 outputs', tensors.map(t=>t.dims))
      dets = decodeYoloV3(tensors, letter.size, letter.dx, letter.dy, letter.scale, DECODE_THRESH)
      dets = nms(dets, NMS_IOU)
    } else {
      if (DBG) console.warn('[YOLO] Unknown OUTPUT_LAYOUT; set VITE_YOLO_OUTPUT_LAYOUT to nms | v8 | v3')
      return []
    }

    // Convert to output format
    let outDet = dets.map(d => ({
      label: labels[d.cls] || `class_${d.cls}`,
      confidence: d.score,
      box: { 
        x: Math.max(0, d.x1), 
        y: Math.max(0, d.y1), 
        w: Math.max(1, d.x2 - d.x1), 
        h: Math.max(1, d.y2 - d.y1) 
      }
    }))

    // Filter by target classes and thresholds
    outDet = outDet.filter(d => {
      const labelLower = d.label.toLowerCase()
      // Check if it's a target class
      const isTarget = TARGETS.length === 0 || TARGETS.some(target => labelLower.includes(target))
      if (!isTarget) return false
      
      // Check confidence threshold
      const threshold = CLASS_THRESH[labelLower] ?? SCORE_THRESH
      return d.confidence >= threshold
    })

    // Update performance stats
    const t1 = performance.now()
    const elapsed = t1 - t0
    perfStats.totalTime += elapsed
    perfStats.avgTime = perfStats.totalTime / perfStats.totalRuns
    perfStats.lastDetections = outDet.length

    if (DBG) {
      console.info('[YOLO] detections', { 
        count: outDet.length,
        first: outDet[0],
        elapsedMs: Math.round(elapsed),
        avgMs: Math.round(perfStats.avgTime),
        totalRuns: perfStats.totalRuns,
        errors: perfStats.errors,
        outputDims: outFirst.dims,
        ep: chosenEP
      })
    }

    return outDet

  } catch (error) {
    perfStats.errors++
    console.error('[YOLO] detectYOLO failed:', error.message)
    return []
  }
}

function parseNMSOutput(outFirst, data, letter) {
  const dets = []
  
  if (data.length % 6 === 0) {
    // Simple [n*6] format: x1,y1,x2,y2,score,cls
    for (let i = 0; i < data.length; i += 6) {
      const score = data[i+4]
      if (score < DECODE_THRESH) continue
      
      const cls = Math.round(data[i+5])
      const x1 = (data[i] - letter.dx) / letter.scale
      const y1 = (data[i+1] - letter.dy) / letter.scale
      const x2 = (data[i+2] - letter.dx) / letter.scale
      const y2 = (data[i+3] - letter.dy) / letter.scale
      dets.push({ x1, y1, x2, y2, score, cls })
    }
  } else {
    // Handle various NMS output shapes
    const dims = outFirst?.dims || []
    if (DBG && perfStats.totalRuns <= 3) console.info('[YOLO] NMS dims', dims)
    
    if (dims.length === 3 && dims[2] === 6) {
      // [1,n,6] format
      const n = dims[1]
      for (let r = 0; r < n; r++) {
        const base = r * 6
        const score = data[base + 4]
        if (score < DECODE_THRESH) continue
        
        const x1 = (data[base] - letter.dx) / letter.scale
        const y1 = (data[base + 1] - letter.dy) / letter.scale
        const x2 = (data[base + 2] - letter.dx) / letter.scale
        const y2 = (data[base + 3] - letter.dy) / letter.scale
        const cls = Math.round(data[base + 5])
        dets.push({ x1, y1, x2, y2, score, cls })
      }
    } else if (dims.length === 2 && dims[1] === 7) {
      // [n,7] format: batch,cls,score,x1,y1,x2,y2
      const n = dims[0]
      for (let r = 0; r < n; r++) {
        const base = r * 7
        const score = data[base + 2]
        if (score < DECODE_THRESH) continue
        
        const cls = Math.round(data[base + 1])
        const x1 = (data[base + 3] - letter.dx) / letter.scale
        const y1 = (data[base + 4] - letter.dy) / letter.scale
        const x2 = (data[base + 5] - letter.dx) / letter.scale
        const y2 = (data[base + 6] - letter.dy) / letter.scale
        dets.push({ x1, y1, x2, y2, score, cls })
      }
    } else if (dims.length === 4 && dims[3] === 7) {
      // [1,1,n,7] format
      const n = dims[2]
      for (let r = 0; r < n; r++) {
        const base = r * 7
        const score = data[base + 2]
        if (score < DECODE_THRESH) continue
        
        const cls = Math.round(data[base + 1])
        const x1 = (data[base + 3] - letter.dx) / letter.scale
        const y1 = (data[base + 4] - letter.dy) / letter.scale
        const x2 = (data[base + 5] - letter.dx) / letter.scale
        const y2 = (data[base + 6] - letter.dy) / letter.scale
        dets.push({ x1, y1, x2, y2, score, cls })
      }
    } else {
      if (DBG) console.warn('[YOLO] Unrecognized NMS output shape:', dims)
    }
  }
  
  return dets
}

function parseV8Output(outFirst, data, letter) {
  const shape = outFirst.dims
  let num, attrs
  
  if (shape.length === 3 && shape[1] > shape[2]) {
    // [1,84,8400] format
    attrs = shape[1]
    num = shape[2]
  } else if (shape.length === 3 && shape[2] > shape[1]) {
    // [1,8400,84] format - transpose needed
    num = shape[1]
    attrs = shape[2]
  } else {
    if (DBG) console.warn('[YOLO] Unexpected v8 output shape:', shape)
    return []
  }

  // Transpose if needed: [1,84,8400] -> [8400,84]
  const stride = attrs
  const rows = num
  const arr = new Float32Array(rows * stride)
  
  if (shape[1] > shape[2]) {
    // Need transpose
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < stride; c++) {
        arr[r * stride + c] = data[c * rows + r]
      }
    }
  } else {
    // Already in correct format
    arr.set(data)
  }

  const boxes = []
  for (let r = 0; r < rows; r++) {
    const cx = arr[r * stride + 0] * letter.size
    const cy = arr[r * stride + 1] * letter.size  
    const w = arr[r * stride + 2] * letter.size
    const h = arr[r * stride + 3] * letter.size
    
    // Find best class
    let best = 0, cls = -1
    for (let c = 4; c < stride; c++) {
      const v = arr[r * stride + c]
      if (v > best) {
        best = v
        cls = c - 4
      }
    }
    
    if (best >= DECODE_THRESH) {
      const x1 = (cx - w/2 - letter.dx) / letter.scale
      const y1 = (cy - h/2 - letter.dy) / letter.scale
      const x2 = (cx + w/2 - letter.dx) / letter.scale
      const y2 = (cy + h/2 - letter.dy) / letter.scale
      boxes.push({ x1, y1, x2, y2, score: best, cls })
    }
  }
  
  return nms(boxes, NMS_IOU)
}

// Optimized NMS with early termination
function nms(dets, iouTh) {
  if (dets.length === 0) return []
  
  // Sort by confidence descending
  dets.sort((a, b) => b.score - a.score)
  
  const keep = []
  const suppress = new Set()
  
  for (let i = 0; i < dets.length; i++) {
    if (suppress.has(i)) continue
    
    const a = dets[i]
    keep.push(a)
    
    // Mark overlapping boxes for suppression
    for (let j = i + 1; j < dets.length; j++) {
      if (suppress.has(j)) continue
      
      const b = dets[j]
      if (iou(a, b) > iouTh) {
        suppress.add(j)
      }
    }
  }
  
  return keep
}

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1)
  const y1 = Math.max(a.y1, b.y1)
  const x2 = Math.min(a.x2, b.x2)
  const y2 = Math.min(a.y2, b.y2)
  
  const w = Math.max(0, x2 - x1)
  const h = Math.max(0, y2 - y1)
  const inter = w * h
  
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
  const union = areaA + areaB - inter
  
  return union > 0 ? inter / union : 0
}

// YOLOv3 decoder remains the same but with minor optimizations
const V3_ANCHORS = [
  [116,90, 156,198, 373,326],
  [30,61, 62,45, 59,119], 
  [10,13, 16,30, 33,23],
]

function sigmoid(x) { return 1 / (1 + Math.exp(-x)) }

function decodeYoloV3(tensors, size, dx, dy, scale, scoreThresh) {
  const boxes = []
  
  for (let i = 0; i < tensors.length; i++) {
    const t = tensors[i]
    const dims = t.dims
    const data = t.data
    let h, w, strideC, chw = true
    
    if (dims.length === 4 && dims[1] === 255) {
      h = dims[2]; w = dims[3]; strideC = w * h; chw = true
    } else if (dims.length === 4 && dims[3] === 255) {
      h = dims[1]; w = dims[2]; strideC = 255; chw = false
    } else {
      continue
    }
    
    const anchors = V3_ANCHORS[i]
    const na = 3, classes = 80
    
    for (let ay = 0; ay < h; ay++) {
      for (let ax = 0; ax < w; ax++) {
        for (let a = 0; a < na; a++) {
          const aOff = a * (5 + classes)
          let tx, ty, tw, th, to, classBest = 0, classId = 0
          
          if (chw) {
            const base = ax + ay * w
            tx = data[(0 + aOff) * (w*h) + base]
            ty = data[(1 + aOff) * (w*h) + base]
            tw = data[(2 + aOff) * (w*h) + base]
            th = data[(3 + aOff) * (w*h) + base]
            to = data[(4 + aOff) * (w*h) + base]
            for (let c = 0; c < classes; c++) {
              const v = data[(5 + aOff + c) * (w*h) + base]
              if (v > classBest) { classBest = v; classId = c }
            }
          } else {
            const base = (ay * w + ax) * (5 + classes) * na + aOff
            tx = data[base + 0]; ty = data[base + 1]
            tw = data[base + 2]; th = data[base + 3]; to = data[base + 4]
            for (let c = 0; c < classes; c++) {
              const v = data[base + 5 + c]
              if (v > classBest) { classBest = v; classId = c }
            }
          }
          
          const objectness = sigmoid(to)
          const clsProb = sigmoid(classBest)  
          const score = objectness * clsProb
          if (score < scoreThresh) continue
          
          const [aw, ah] = [anchors[a*2], anchors[a*2 + 1]]
          const cx = (sigmoid(tx) + ax) * (size / w)
          const cy = (sigmoid(ty) + ay) * (size / h)
          const bw = Math.exp(tw) * aw * (size / 416)
          const bh = Math.exp(th) * ah * (size / 416)
          
          const x1 = (cx - bw/2 - dx) / scale
          const y1 = (cy - bh/2 - dy) / scale
          const x2 = (cx + bw/2 - dx) / scale
          const y2 = (cy + bh/2 - dy) / scale
          
          boxes.push({ x1, y1, x2, y2, score, cls: classId })
        }
      }
    }
  }
  return boxes
}

function parseExpectedSizeFromError(e) {
  try {
    const msg = String(e && e.message || '')
    const patterns = [
      /Expected:\s*(\d+)/,
      /expected.*?(\d+)/i,
      /shape.*?(\d+)/i
    ]
    for (const pattern of patterns) {
      const m = msg.match(pattern)
      if (m) return Number(m[1])
    }
  } catch {}
  return null
}

function parseClassThresholds(spec) {
  const map = {}
  if (!spec) return map
  
  try {
    const s = String(spec).trim()
    if (s.startsWith('{')) {
      const obj = JSON.parse(s)
      for (const [k, v] of Object.entries(obj)) {
        map[String(k).toLowerCase()] = Number(v)
      }
    } else {
      for (const part of s.split(',')) {
        const [k, v] = part.split(':')
        if (k && v) {
          map[k.trim().toLowerCase()] = Number(v)
        }
      }
    }
  } catch (e) {
    console.warn('[YOLO] Failed to parse class thresholds:', e.message)
  }
  return map
}

// Export performance stats for debugging
export function getYOLOStats() {
  return { ...perfStats }
}

// Clear caches - useful for memory management
export function clearYOLOCache() {
  tensorCache.clear()
  canvasCache.canvas = null
  canvasCache.ctx = null
  canvasCache.size = null
  if (DBG) console.info('[YOLO] caches cleared')
}