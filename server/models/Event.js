import mongoose from '../db.js'

const EventSchema = new mongoose.Schema({
  sessionId: { type: String, index: true, required: true },
  type: { type: String, index: true, required: true },
  details: { type: String, default: '' },
  time: { type: Date, default: () => new Date(), index: true },
  // Optional normalized fields to help reporting
  objects: [{ type: String }],
  meta: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true })

// Use explicit collection name 'report' as requested
const Event = mongoose.models.Event || mongoose.model('Event', EventSchema, 'report')
export default Event
