import User from '../models/User.js'

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers['authorization'] || ''
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : (req.cookies?.token || req.headers['x-auth-token'] || req.query?.token || req.body?.token || null)
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await User.findOne({ token }).lean()
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = user
    next()
  } catch (e) {
    console.error(e)
    res.status(401).json({ error: 'Unauthorized' })
  }
}
