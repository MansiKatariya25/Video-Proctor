import mongoose from '../db.js'

const InterviewSchema = new mongoose.Schema({
  interviewId: { type: String, required: true, unique: true, index: true },
  token: { type: String, required: true, unique: true, index: true },
  title: { type: String },
  interviewerName: { type: String },
  interviewerEmail: { type: String },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  candidateName: { type: String },
  candidateEmail: { type: String },
  scheduledAt: { type: Date },
  sessionId: { type: String, required: true, index: true },
  status: { type: String, default: 'scheduled' }, // scheduled | started | ended | cancelled
}, { timestamps: true })

const Interview = mongoose.models.Interview || mongoose.model('Interview', InterviewSchema)
export default Interview
