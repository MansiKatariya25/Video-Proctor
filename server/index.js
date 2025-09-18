import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
// Load env from project root and server/.env (both supported)
dotenv.config()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { createServer } from 'http'
import { randomUUID } from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { connectMongo } from './db.js'
import eventsRouter from './routes/events.js'
import reportsRouter from './routes/reports.js'
import uploadRouter from './routes/upload.js'
import sessionsRouter from './routes/sessions.js'
import interviewsRouter from './routes/interviews.js'
import authRouter from './routes/auth.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(morgan('tiny'))

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.use('/api/events', eventsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api', uploadRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/interviews', interviewsRouter)
app.use('/api/auth', authRouter)

const httpServer = createServer(app)

const sessions = new Map()

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      candidate: null,
      candidateId: null,
      viewers: new Map(),
      pendingReady: new Set(),
    })
  }
  return sessions.get(sessionId)
}

function cleanupSession(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) return
  if (!session.candidate && session.viewers.size === 0) {
    sessions.delete(sessionId)
  }
}

function sendJSON(socket, payload) {
  try {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload))
    }
  } catch (err) {
    console.warn('WS send error', err)
  }
}

const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

wss.on('connection', (socket) => {
  socket.id = randomUUID()
  socket.sessionId = null
  socket.role = null
  sendJSON(socket, { type: 'welcome', clientId: socket.id })

  socket.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch (_err) {
      return
    }

    if (msg.type === 'join') {
      const { sessionId, role } = msg
      if (!sessionId || !role) return
      socket.sessionId = sessionId
      socket.role = role
      const session = getSession(sessionId)
      if (role === 'candidate') {
        if (session.candidate && session.candidate !== socket) {
          sendJSON(session.candidate, { type: 'candidate-left', from: socket.id })
          session.candidate.close()
        }
        session.candidate = socket
        session.candidateId = socket.id
        session.pendingReady.forEach((viewerId) => {
          const viewer = session.viewers.get(viewerId)
          if (viewer) sendJSON(session.candidate, { type: 'viewer-ready', from: viewerId })
        })
        session.pendingReady.clear()
      } else {
        session.viewers.set(socket.id, socket)
      }
      cleanupSession(sessionId)
      return
    }

    if (!socket.sessionId) return
    const session = getSession(socket.sessionId)

    if (msg.type === 'ready' && socket.role === 'interviewer') {
      if (session.candidate) {
        sendJSON(session.candidate, { type: 'viewer-ready', from: socket.id })
      } else {
        session.pendingReady.add(socket.id)
      }
      sendJSON(socket, { type: 'ready-ack' })
      return
    }

    if (msg.type === 'signal') {
      const { to, signal } = msg
      if (!signal) return
      let target
      if (to === 'candidate' || !to) {
        target = session.candidate
      } else {
        target = session.viewers.get(to)
      }
      if (target) {
        sendJSON(target, { type: 'signal', from: socket.id, signal })
      }
      return
    }

    if (msg.type === 'event') {
      const payload = { type: 'event', event: msg.event, from: socket.id }
      if (socket.role === 'candidate') {
        session.viewers.forEach((viewer) => {
          if (viewer !== socket) sendJSON(viewer, payload)
        })
      } else if (session.candidate) {
        sendJSON(session.candidate, payload)
      }
      return
    }
  })

  socket.on('close', () => {
    const { sessionId, role } = socket
    if (!sessionId) return
    const session = sessions.get(sessionId)
    if (!session) return
    if (role === 'candidate') {
      session.candidate = null
      session.candidateId = null
      session.viewers.forEach((viewer, id) => {
        sendJSON(viewer, { type: 'candidate-left', from: socket.id })
      })
    } else {
      session.viewers.delete(socket.id)
      session.pendingReady.delete(socket.id)
      if (session.candidate) {
        sendJSON(session.candidate, { type: 'viewer-disconnected', from: socket.id })
      }
    }
    cleanupSession(sessionId)
  })
})

const PORT = process.env.PORT || 3001

connectMongo().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`)
  })
}).catch((e) => {
  console.error('Failed to connect to MongoDB', e)
  process.exit(1)
})
