import { Router } from 'express'
import multer from 'multer'
import { ObjectId } from 'mongodb'
import { getBucket } from '../db.js'
import Recording from '../models/Recording.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } }) // 1 GB cap

// POST /api/upload  form-data: file, sessionId(optional)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' })
    const sessionId = req.body.sessionId || 'unknown'
    const bucket = getBucket()
    const meta = { sessionId, mimetype: req.file.mimetype, size: req.file.size }
    const uploadStream = bucket.openUploadStream(req.file.originalname || `recording-${Date.now()}.webm`, { metadata: meta })
    uploadStream.end(req.file.buffer)
    uploadStream.on('error', (e) => {
      console.error(e)
      res.status(500).json({ error: 'Failed to store recording' })
    })
    uploadStream.on('finish', async (file) => {
      await Recording.create({ sessionId, filename: file.filename, fileId: file._id, mimetype: meta.mimetype, size: meta.size })
      res.json({ ok: true, fileId: file._id, filename: file.filename })
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Upload error' })
  }
})

// GET /api/recordings/:id  -> streams the stored file
router.get('/recordings/:id', async (req, res) => {
  try {
    const { id } = req.params
    const bucket = getBucket()
    const stream = bucket.openDownloadStream(new ObjectId(id))
    stream.on('error', () => res.status(404).end())
    stream.pipe(res)
  } catch (e) {
    console.error(e)
    res.status(500).end()
  }
})

export default router
