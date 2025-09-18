import { Router } from 'express'
import Interview from '../models/Interview.js'
import Report from '../models/Report.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

function randomId(prefix='') {
  const s = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
  return prefix ? `${prefix}-${s}` : s
}

function resolveAppOrigin(req) {
  // 1) Explicit override
  if (process.env.APP_ORIGIN) {
    const o = process.env.APP_ORIGIN
    return /^https?:\/\//i.test(o) ? o : `http://${o}`
  }
  // 2) Use Origin header from browser (preferred in dev via proxy)
  const hdrOrigin = req.headers.origin
  if (hdrOrigin && /^https?:\/\//i.test(hdrOrigin)) return hdrOrigin
  // 3) Fallback to Referer header (strip path)
  const referer = req.headers.referer
  if (referer && /^https?:\/\//i.test(referer)) {
    try { const u = new URL(referer); return `${u.protocol}//${u.host}` } catch {}
  }
  // 4) Final fallback for local dev
  return 'http://localhost:5173'
}

// POST /api/interviews  -> create interview and candidate link
// body: { title?, interviewerName?, interviewerEmail?, scheduledAt? }
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, interviewerName, interviewerEmail, scheduledAt } = req.body || {}
    const interviewId = randomId('int')
    const token = randomId('join')
    const sessionId = randomId('sess')
    const doc = await Interview.create({ interviewId, token, title, interviewerName: interviewerName || req.user.name, interviewerEmail: interviewerEmail || req.user.email, ownerId: req.user._id, scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined, sessionId })
    const origin = resolveAppOrigin(req)
    const candidateUrl = `${origin}/candidate/${doc.token}`
    res.json({ ok: true, interview: doc, candidateUrl })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to create interview' })
  }
})

// GET /api/interviews/:token -> fetch interview by token (for candidate join)
router.get('/:token', async (req, res) => {
  try {
    const doc = await Interview.findOne({ token: req.params.token }).lean()
    if (!doc) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true, interview: doc })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to fetch interview' })
  }
})

// POST /api/interviews/:token/candidate -> set candidate info and mark started
router.post('/:token/candidate', async (req, res) => {
  try {
    const { candidateName, candidateEmail } = req.body || {}
    const doc = await Interview.findOneAndUpdate(
      { token: req.params.token },
      { $set: { candidateName, candidateEmail, status: 'started' } },
      { new: true }
    )
    if (!doc) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true, interview: doc })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to update candidate' })
  }
})

// GET /api/interviews/mine -> list interviews for logged-in interviewer with report summary
router.get('/', requireAuth, async (req, res) => {
  try {
    const list = await Interview.find({ ownerId: req.user._id }).sort({ createdAt: -1 }).lean()
    const sessionIds = list.map(i => i.sessionId)
    const reports = await Report.find({ sessionId: { $in: sessionIds } }).lean()
    const reportsBySession = Object.fromEntries(reports.map(r => [r.sessionId, { score: r.integrity?.score || 100, counts: r.counts }]))
    res.json({ ok: true, interviews: list, reports: reportsBySession })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to fetch interviews' })
  }
})

export default router
