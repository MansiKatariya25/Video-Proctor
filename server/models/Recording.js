import mongoose from '../db.js'

const RecordingSchema = new mongoose.Schema({
  sessionId: { type: String, index: true, required: true },
  filename: { type: String, required: true },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  mimetype: { type: String },
  size: { type: Number },
}, { timestamps: true })

const Recording = mongoose.models.Recording || mongoose.model('Recording', RecordingSchema)
export default Recording
