import { Router } from 'express'
import Event from '../models/Event.js'

const router = Router()

// POST /api/events  { sessionId, type, details, time?, objects?, meta? }
router.post('/', async (req, res) => {
  try {
    const { sessionId, type, details, time, objects, meta } = req.body || {}
    if (!sessionId || !type) return res.status(400).json({ error: 'sessionId and type are required' })
    const doc = await Event.create({ sessionId, type, details: details || '', time: time ? new Date(time) : new Date(), objects, meta })
    res.json({ ok: true, id: doc._id })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to store event' })
  }
})

// GET /api/events?sessionId=...&type=...&limit=100
router.get('/', async (req, res) => {
  try {
    const { sessionId, type } = req.query
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000)
    const q = {}
    if (sessionId) q.sessionId = sessionId
    if (type) q.type = type
    const rows = await Event.find(q).sort({ time: -1 }).limit(limit).lean()
    res.json({ ok: true, events: rows })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to fetch events' })
  }
})

export default router

