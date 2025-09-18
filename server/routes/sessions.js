import { Router } from 'express'
import Session from '../models/Session.js'

const router = Router()

// Upsert session info
// POST /api/sessions  { sessionId, candidateName?, startedAt?, endedAt?, meta? }
router.post('/', async (req, res) => {
  try {
    const { sessionId, candidateName, startedAt, endedAt, meta } = req.body || {}
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
    const update = {}
    if (candidateName !== undefined) update.candidateName = candidateName
    if (startedAt) update.startedAt = new Date(startedAt)
    if (endedAt) update.endedAt = new Date(endedAt)
    if (meta !== undefined) update.meta = meta
    const doc = await Session.findOneAndUpdate({ sessionId }, { $set: update, $setOnInsert: { sessionId } }, { new: true, upsert: true })
    res.json({ ok: true, session: doc })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to save session' })
  }
})

// GET /api/sessions/:sessionId
router.get('/:sessionId', async (req, res) => {
  try {
    const doc = await Session.findOne({ sessionId: req.params.sessionId }).lean()
    if (!doc) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true, session: doc })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to fetch session' })
  }
})

export default router

