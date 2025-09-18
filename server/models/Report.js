import mongoose from '../db.js'

const ReportSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  candidateName: { type: String, index: true },
  interviewDuration: { type: String },
  counts: {
    focusLost: { type: Number, default: 0 },
    multipleFaces: { type: Number, default: 0 },
    noFace: { type: Number, default: 0 },
    phoneDetected: { type: Number, default: 0 },
    notesDetected: { type: Number, default: 0 },
    eyesClosed: { type: Number, default: 0 },
    drowsiness: { type: Number, default: 0 },
    backgroundVoices: { type: Number, default: 0 },
  },
  integrity: {
    score: { type: Number, default: 100 },
    deductions: { type: Object, default: {} },
    weights: { type: Object, default: {} },
    caps: { type: Object, default: {} },
  },
  timeRange: {
    start: { type: Date },
    end: { type: Date },
  },
  // Optional debugging/audit fields
  meta: {
    raw: {
      totalEvents: { type: Number, default: 0 },
      objectTallies: { type: Object, default: {} },
      episodeConfig: { type: Object, default: {} },
    },
  },
  generatedAt: { type: Date, default: () => new Date() },
}, { timestamps: true })

const Report = mongoose.models.Report || mongoose.model('Report', ReportSchema)

export default Report
