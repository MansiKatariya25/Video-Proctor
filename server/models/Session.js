import mongoose from '../db.js'

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  candidateName: { type: String },
  startedAt: { type: Date },
  endedAt: { type: Date },
  meta: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true })

const Session = mongoose.models.Session || mongoose.model('Session', SessionSchema)
export default Session

