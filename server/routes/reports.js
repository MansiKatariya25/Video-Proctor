import { Router } from 'express'
import PDFDocument from 'pdfkit'
import Event from '../models/Event.js'
import Session from '../models/Session.js'
import Report from '../models/Report.js'
import Interview from '../models/Interview.js'

const router = Router()

// GET /api/reports/:sessionId/pdf -> generate and download PDF summary
router.get('/:sessionId/pdf', async (req, res) => {
  try {
    const { sessionId } = req.params
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

    const [events, session, interview] = await Promise.all([
      Event.find({ sessionId }).sort({ time: 1 }).lean(),
      Session.findOne({ sessionId }).lean(),
      Interview.findOne({ sessionId }).lean(),
    ])

    const summary = buildSummary(events, session)
    const durationMs = (summary.startTime && summary.endTime) ? (new Date(summary.endTime) - new Date(summary.startTime)) : 0
    const duration = formatDuration(durationMs)

    const cfg = episodeConfigFromEnv()
    const episodes = computeEpisodes(events, cfg)
    const weights = scoringWeightsFromEnv()
    const caps = scoringCapsFromEnv()
    const deductionsRaw = {
      focusLoss: episodes.focus > 0 ? weights.focusLoss : 0,
      noFace: episodes.noFace > 0 ? weights.noFace : 0,
      multipleFaces: episodes.multiFace > 0 ? weights.multipleFaces : 0,
      phone: episodes.phone > 0 ? weights.phone : 0,
      notes: episodes.notes > 0 ? weights.notes : 0,
      eyesClosed: episodes.eyesClosed > 0 ? weights.eyesClosed : 0,
      drowsiness: episodes.drowsiness > 0 ? weights.drowsiness : 0,
      backgroundVoices: episodes.backgroundVoices > 0 ? weights.backgroundVoices : 0,
    }
    const deductions = Object.fromEntries(Object.entries(deductionsRaw).map(([k, v]) => [k, Math.min(v, caps[k] ?? v)]))
    const totalDeduction = Object.values(deductions).reduce((a,b) => a + b, 0)
    const integrityScore = Math.max(0, 100 - totalDeduction)

    // Prepare PDF
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="proctor-report-${sessionId}.pdf"`)
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    doc.pipe(res)

    // Header
    doc.fontSize(20).text('Proctoring Report', { align: 'center' })
    if (interview?.title) doc.moveDown(0.2).fontSize(12).text(interview.title, { align: 'center' })
    doc.moveDown(0.2).fontSize(10).text(new Date().toLocaleString(), { align: 'center' })
    doc.moveDown().moveTo(50, doc.y).lineTo(545, doc.y).stroke().moveDown()

    // Summary
    const candidateName = summary.candidateName || 'N/A'
    const candidateEmail = summary.candidateEmail || 'N/A'
    const interviewerName = interview?.interviewerName || 'N/A'
    const interviewerEmail = interview?.interviewerEmail || 'N/A'

    doc.fontSize(12)
    doc.text(`Candidate: ${candidateName}`)
    doc.text(`Email: ${candidateEmail}`)
    doc.text(`Interviewer: ${interviewerName}`)
    doc.text(`Email: ${interviewerEmail}`)
    doc.text(`Session ID: ${sessionId}`)
    doc.text(`Interview Duration: ${duration}`)
    doc.text(`Time Range: ${summary.startTime || 'N/A'}  ->  ${summary.endTime || 'N/A'}`)
    if (interview?.scheduledAt) doc.text(`Scheduled: ${new Date(interview.scheduledAt).toLocaleString()}`)
    doc.moveDown()

    // Detected Objects
    doc.fontSize(14).text('Detected Objects')
    const objEntries = Object.entries(summary.objects || {})
    if (objEntries.length) {
      doc.moveDown(0.2).fontSize(12)
      objEntries.forEach(([k, v]) => doc.text(`• ${k}: ${v}`))
    } else {
      doc.moveDown(0.2).fontSize(12).text('• None')
    }

    doc.moveDown().moveTo(50, doc.y).lineTo(545, doc.y).stroke().moveDown(0.5)

    // Deductions table (aligned columns)
    doc.fontSize(14).text('Deductions (flat per category)')
    doc.moveDown(0.3)
    const colX = [55, 300, 380, 470]
    doc.fontSize(11)
    doc.text('Category', colX[0], doc.y)
      .text('Count', colX[1], doc.y)
      .text('Weight', colX[2], doc.y)
      .text('Applied', colX[3], doc.y)
    doc.moveDown(0.2)
    doc.moveTo(colX[0], doc.y).lineTo(545, doc.y).stroke()
    doc.moveDown(0.2)

    const rows = [
      ['Focus Lost', String(episodes.focus), String(weights.focusLoss), String(deductions.focusLoss)],
      ['No Face', String(episodes.noFace), String(weights.noFace), String(deductions.noFace)],
      ['Multiple Faces', String(episodes.multiFace), String(weights.multipleFaces), String(deductions.multipleFaces)],
      ['Phone Detected', String(episodes.phone), String(weights.phone), String(deductions.phone)],
      ['Notes/Books', String(episodes.notes), String(weights.notes), String(deductions.notes)],
      ['Eyes Closed', String(episodes.eyesClosed), String(weights.eyesClosed), String(deductions.eyesClosed)],
      ['Drowsiness', String(episodes.drowsiness), String(weights.drowsiness), String(deductions.drowsiness)],
      ['Background Voices', String(episodes.backgroundVoices), String(weights.backgroundVoices), String(deductions.backgroundVoices)],
    ]
    rows.forEach((r) => {
      const y = doc.y
      doc.text(r[0], colX[0], y)
        .text(r[1], colX[1], y)
        .text(r[2], colX[2], y)
        .text(r[3], colX[3], y)
      doc.moveDown(0.2)
    })

    doc.moveDown().moveTo(50, doc.y).lineTo(545, doc.y).stroke()

    // Totals (left aligned, full width)
    const pageLeft = 50
    const contentWidth = 545 - pageLeft
    doc.moveDown()
    doc.fontSize(16).text(`Total Deduction: ${totalDeduction}`, pageLeft, undefined, { width: contentWidth, align: 'left' })
    doc.moveDown(0.2)
    doc.fontSize(20).text(`Integrity Score: ${integrityScore}/100`, pageLeft, undefined, { width: contentWidth, align: 'left' })

    // Footer
    doc.moveDown(1)
    doc.fontSize(9).fillColor('#555').text('Generated by Video Proctoring System', 50, 780, { align: 'center' })

    doc.end()
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to generate PDF' })
  }
})

// GET /api/reports/:sessionId
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
    const [events, session] = await Promise.all([
      Event.find({ sessionId }).sort({ time: 1 }).lean(),
      Session.findOne({ sessionId }).lean(),
    ])

    const summary = buildSummary(events, session)
    // Compute derived metrics
    const durationMs = (summary.startTime && summary.endTime) ? (new Date(summary.endTime) - new Date(summary.startTime)) : 0
    const duration = formatDuration(durationMs)

    // Episode-based scoring with cooldowns and caps (tunable via env)
    const cfg = episodeConfigFromEnv()
    const episodes = computeEpisodes(events, cfg)

    // Integrity scoring (weights + caps)
    const weights = scoringWeightsFromEnv()
    const caps = scoringCapsFromEnv()
    // Flat per-category deductions (no multiplication by count)
    const deductionsRaw = {
      focusLoss: episodes.focus > 0 ? weights.focusLoss : 0,
      noFace: episodes.noFace > 0 ? weights.noFace : 0,
      multipleFaces: episodes.multiFace > 0 ? weights.multipleFaces : 0,
      phone: episodes.phone > 0 ? weights.phone : 0,
      notes: episodes.notes > 0 ? weights.notes : 0,
      eyesClosed: episodes.eyesClosed > 0 ? weights.eyesClosed : 0,
      drowsiness: episodes.drowsiness > 0 ? weights.drowsiness : 0,
      backgroundVoices: episodes.backgroundVoices > 0 ? weights.backgroundVoices : 0,
    }
    const deductions = Object.fromEntries(Object.entries(deductionsRaw).map(([k, v]) => [k, Math.min(v, caps[k] ?? v)]))
    const totalDeduction = Object.values(deductions).reduce((a,b) => a + b, 0)
    const integrityScore = Math.max(0, 100 - totalDeduction)

    const report = {
      sessionId,
      candidateName: summary.candidateName,
      interviewDuration: duration,
      counts: {
        // use episode counts for stability
        focusLost: episodes.focus,
        multipleFaces: episodes.multiFace,
        noFace: episodes.noFace,
        phoneDetected: episodes.phone,
        notesDetected: episodes.notes,
        eyesClosed: episodes.eyesClosed,
        drowsiness: episodes.drowsiness,
        backgroundVoices: episodes.backgroundVoices,
      },
      integrity: {
        score: integrityScore,
        deductions,
        weights,
        caps,
      },
      timeRange: { start: summary.startTime, end: summary.endTime },
    }
    // Persist a single report document per session
    await Report.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          sessionId,
          candidateName: summary.candidateName,
          interviewDuration: report.interviewDuration,
          counts: report.counts,
          integrity: report.integrity,
          timeRange: report.timeRange,
          'meta.raw': {
            totalEvents: summary.totalEvents,
            objectTallies: summary.objects,
            episodeConfig: cfg,
          },
          generatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    )

    res.json({ ok: true, summary, report, events })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to build report' })
  }
})

export default router

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function sumKeys(dict, regexes) {
  let sum = 0
  for (const [k, v] of Object.entries(dict)) {
    if (regexes.some((r) => r.test(k))) sum += v
  }
  return sum
}

// Build raw summary tallies
function buildSummary(events, session) {
  const summary = {
    sessionId: session?.sessionId,
    candidateName: session?.candidateName || null,
    totalEvents: events.length,
    focusViolations: 0,
    noFaceViolations: 0,
    multipleFaces: 0,
    objects: {},
    eyesClosedEvents: 0,
    drowsinessEvents: 0,
    backgroundVoiceEvents: 0,
    startTime: session?.startedAt || events[0]?.time || null,
    endTime: session?.endedAt || events[events.length - 1]?.time || null,
  }
  for (const e of events) {
    if (e.type === 'not-looking-5s') summary.focusViolations++
    if (e.type === 'no-face-10s') summary.noFaceViolations++
    if (e.type === 'multiple-faces') summary.multipleFaces++
    if (e.type === 'eyes-closed') summary.eyesClosedEvents++
    if (e.type === 'drowsiness-detected') summary.drowsinessEvents++
    if (e.type === 'background-voices') summary.backgroundVoiceEvents++
    if (e.type === 'object-detected') {
      const obs = normalizeObjectsFromEvent(e)
      for (const name of obs) summary.objects[name] = (summary.objects[name] || 0) + 1
    }
  }
  return summary
}

function normalizeObjectsFromEvent(e) {
  if (e.objects && e.objects.length) return e.objects.map(s => String(s).trim().toLowerCase())
  const raw = String(e.details || '')
  return raw.split(',').map(s => s.trim().toLowerCase().replace(/\s+\d+%$/, '')).filter(Boolean)
}

function isPhoneLabel(name) {
  const n = String(name).toLowerCase()
  return /(cell\s?phone|\bmobile\b|^phone$|smart\s?phone|iphone|android)/.test(n)
}
function isNotesLabel(name) {
  const n = String(name).toLowerCase()
  return /(book|notebook|paper|diary|notes|sheet)/.test(n)
}

function episodeConfigFromEnv() {
  const num = (v, d) => {
    const n = Number(process.env[v]); return Number.isFinite(n) ? n : d
  }
  return {
    objectCooldownSec: num('REPORT_OBJECT_COOLDOWN', 10),
    focusCooldownSec: num('REPORT_FOCUS_COOLDOWN', 20),
    multiFaceCooldownSec: num('REPORT_MULTIFACE_COOLDOWN', 20),
    noFaceCooldownSec: num('REPORT_NOFACE_COOLDOWN', 30),
    eyesClosedCooldownSec: num('REPORT_EYESCLOSED_COOLDOWN', 15),
    drowyCooldownSec: num('REPORT_DROWSY_COOLDOWN', 20),
    audioCooldownSec: num('REPORT_AUDIO_COOLDOWN', 20),
  }
}

function scoringWeightsFromEnv() {
  const num = (v, d) => {
    const n = Number(process.env[v]); return Number.isFinite(n) ? n : d
  }
  return {
    focusLoss: num('REPORT_WT_FOCUS', 5),
    noFace: num('REPORT_WT_NOFACE', 10),
    multipleFaces: num('REPORT_WT_MULTIFACE', 10),
    phone: num('REPORT_WT_PHONE', 15),
    notes: num('REPORT_WT_NOTES', 10),
    eyesClosed: num('REPORT_WT_EYESCLOSED', 8),
    drowsiness: num('REPORT_WT_DROWSY', 12),
    backgroundVoices: num('REPORT_WT_AUDIO', 8),
  }
}

function scoringCapsFromEnv() {
  const num = (v, d) => {
    const n = Number(process.env[v]); return Number.isFinite(n) ? n : d
  }
  return {
    focusLoss: num('REPORT_CAP_FOCUS', 40),
    noFace: num('REPORT_CAP_NOFACE', 50),
    multipleFaces: num('REPORT_CAP_MULTIFACE', 50),
    phone: num('REPORT_CAP_PHONE', 60),
    notes: num('REPORT_CAP_NOTES', 40),
    eyesClosed: num('REPORT_CAP_EYESCLOSED', 30),
    drowsiness: num('REPORT_CAP_DROWSY', 35),
    backgroundVoices: num('REPORT_CAP_AUDIO', 30),
  }
}

// Collapse raw events to episode counts with cooldown windows
function computeEpisodes(events, cfg) {
  const ms = (s) => s * 1000
  const focusCd = ms(cfg.focusCooldownSec)
  const multiCd = ms(cfg.multiFaceCooldownSec)
  const nofaceCd = ms(cfg.noFaceCooldownSec)
  const objCd = ms(cfg.objectCooldownSec)
  const eyesCd = ms(cfg.eyesClosedCooldownSec)
  const drowCd = ms(cfg.drowsyCooldownSec)
  const audCd = ms(cfg.audioCooldownSec)

  let lastFocus = 0, focus = 0
  let lastMulti = 0, multiFace = 0
  let lastNoFace = 0, noFace = 0
  let lastPhone = 0, phone = 0
  let lastNotes = 0, notes = 0
  let lastEyes = 0, eyesClosed = 0
  let lastDrowsy = 0, drowsiness = 0
  let lastAudio = 0, backgroundVoices = 0

  for (const e of events) {
    const t = new Date(e.time).getTime()
    if (e.type === 'not-looking-5s') {
      if (!lastFocus || (t - lastFocus) > focusCd) { focus++; lastFocus = t }
    } else if (e.type === 'multiple-faces') {
      if (!lastMulti || (t - lastMulti) > multiCd) { multiFace++; lastMulti = t }
    } else if (e.type === 'no-face-10s') {
      if (!lastNoFace || (t - lastNoFace) > nofaceCd) { noFace++; lastNoFace = t }
    } else if (e.type === 'object-detected') {
      const obs = normalizeObjectsFromEvent(e)
      const hasPhone = obs.some(isPhoneLabel)
      const hasNotes = obs.some(isNotesLabel)
      if (hasPhone && (!lastPhone || (t - lastPhone) > objCd)) { phone++; lastPhone = t }
      if (hasNotes && (!lastNotes || (t - lastNotes) > objCd)) { notes++; lastNotes = t }
    } else if (e.type === 'eyes-closed') {
      if (!lastEyes || (t - lastEyes) > eyesCd) { eyesClosed++; lastEyes = t }
    } else if (e.type === 'drowsiness-detected') {
      if (!lastDrowsy || (t - lastDrowsy) > drowCd) { drowsiness++; lastDrowsy = t }
    } else if (e.type === 'background-voices') {
      if (!lastAudio || (t - lastAudio) > audCd) { backgroundVoices++; lastAudio = t }
    }
  }
  return { focus, multiFace, noFace, phone, notes, eyesClosed, drowsiness, backgroundVoices }
}
