import { Router } from 'express'
import crypto from 'crypto'
import User from '../models/User.js'

const router = Router()

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex')
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex')
}

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {}
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' })
    const existing = await User.findOne({ email }).lean()
    if (existing) return res.status(409).json({ error: 'Email already registered' })
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = hashPassword(password, salt)
    const token = makeToken()
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash, passwordSalt: salt, token })
    res.json({ ok: true, token, user: { _id: user._id, name: user.name, email: user.email } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Signup failed' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' })
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    const hash = hashPassword(password, user.passwordSalt)
    if (hash !== user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' })
    user.token = makeToken()
    await user.save()
    res.json({ ok: true, token: user.token, user: { _id: user._id, name: user.name, email: user.email } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Login failed' })
  }
})

router.get('/me', async (req, res) => {
  try {
    const header = req.headers['authorization'] || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await User.findOne({ token }).lean()
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    res.json({ ok: true, user: { _id: user._id, name: user.name, email: user.email } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed' })
  }
})

export default router

