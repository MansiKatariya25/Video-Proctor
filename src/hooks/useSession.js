import { useEffect, useMemo, useState } from 'react'
import { nowISO } from '../lib/utils.js'

export default function useSession() {
  const [candidateName, setCandidateName] = useState('')
  const sessionId = useMemo(() => {
    const key = 'proctor.sessionId'
    // Allow /interview/:sessionId to override local session id
    const path = typeof location !== 'undefined' ? location.pathname : ''
    const match = path.match(/^\/interview\/([^/]+)/)
    if (match && match[1]) {
      const idFromPath = decodeURIComponent(match[1])
      localStorage.setItem(key, idFromPath)
      return idFromPath
    }
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const id = (crypto?.randomUUID?.() || `sess-${Date.now()}-${Math.floor(Math.random()*1e6)}`)
    localStorage.setItem(key, id)
    return id
  }, [])
  useEffect(() => {
    const saved = localStorage.getItem('proctor.candidateName')
    if (saved) setCandidateName(saved)
  }, [])
  const saveName = (name) => {
    setCandidateName(name)
    localStorage.setItem('proctor.candidateName', name)
    fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId, candidateName: name }) }).catch(()=>{})
  }
  const markStart = () => fetch('/api/sessions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sessionId, candidateName, startedAt: nowISO() }) }).catch(()=>{})
  const markEnd = () => fetch('/api/sessions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sessionId, endedAt: nowISO() }) }).catch(()=>{})
  const fetchReport = async () => {
    const res = await fetch(`/api/reports/${sessionId}`)
    const data = await res.json()
    return data?.report
  }
  return { sessionId, candidateName, saveName, markStart, markEnd, fetchReport }
}
