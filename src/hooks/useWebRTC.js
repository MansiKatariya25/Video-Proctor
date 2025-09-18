import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

function createPeerConnection() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS })
}

export default function useWebRTC({ sessionId, role, onRemoteStream, onEvent }) {
  const socketRef = useRef(null)
  const peersRef = useRef(new Map())
  const localStreamRef = useRef(null)
  const pendingViewersRef = useRef(new Set())
  const connectedRef = useRef(false)
  const [connected, setConnected] = useState(false)
  // Buffer ICE candidates until remoteDescription is set
  const pendingIceRef = useRef(new Map())

  const ensureSocket = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) return socketRef.current
    return socketRef.current
  }, [])

  const sendMessage = useCallback((msg) => {
    const ws = socketRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ...msg, sessionId, role }))
    }
  }, [sessionId, role])

  const handleRemoteStream = useCallback((id, event) => {
    if (!onRemoteStream) return
    const stream = event.streams?.[0] || new MediaStream([event.track])
    onRemoteStream({ id, stream })
  }, [onRemoteStream])

  const flushPendingIce = useCallback(async (peerId) => {
    const pc = peersRef.current.get(peerId)
    if (!pc) return
    const list = pendingIceRef.current.get(peerId)
    if (list && list.length) {
      for (const cand of list) {
        try { await pc.addIceCandidate(cand) } catch (err) { console.warn('Flush ICE failed', err) }
      }
      pendingIceRef.current.delete(peerId)
    }
  }, [])

  const createPeerForViewer = useCallback((viewerId) => {
    if (peersRef.current.has(viewerId)) return peersRef.current.get(viewerId)
    const stream = localStreamRef.current
    if (!stream) {
      pendingViewersRef.current.add(viewerId)
      return null
    }

    const pc = createPeerConnection()
    peersRef.current.set(viewerId, pc)
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))
    pc.onicecandidate = (ev) => {
      if (ev.candidate) sendMessage({ type: 'signal', to: viewerId, signal: { type: 'candidate', candidate: ev.candidate } })
    }
    pc.ontrack = (event) => handleRemoteStream(viewerId, event)
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        connectedRef.current = true
        setConnected(true)
      }
    }

    return pc
  }, [handleRemoteStream, sendMessage])

  const setupPeerForViewer = useCallback(async (viewerId) => {
    if (peersRef.current.has(viewerId)) return
    const pc = createPeerForViewer(viewerId)
    if (!localStreamRef.current || !pc) return

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sendMessage({ type: 'signal', to: viewerId, signal: { type: 'offer', sdp: offer } })
  }, [createPeerForViewer, sendMessage])

  const ensurePeerForCandidate = useCallback((candidateId) => {
    if (peersRef.current.has(candidateId)) return peersRef.current.get(candidateId)
    const pc = createPeerConnection()
    peersRef.current.set(candidateId, pc)
    if (localStreamRef.current) {
      const senders = pc.getSenders()
      localStreamRef.current.getTracks().forEach((track) => {
        const existing = senders.find((sender) => sender.track && sender.track.kind === track.kind)
        if (existing) {
          existing.replaceTrack(track)
        } else {
          pc.addTrack(track, localStreamRef.current)
        }
      })
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) sendMessage({ type: 'signal', to: 'candidate', signal: { type: 'candidate', candidate: ev.candidate } })
    }
    pc.ontrack = (event) => handleRemoteStream(candidateId, event)
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        connectedRef.current = true
        setConnected(true)
      }
    }
    return pc
  }, [handleRemoteStream, sendMessage])

  useEffect(() => {
    if (!sessionId || !role) return () => {}
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const defaultUrl = `${protocol}://${window.location.host}/ws`
    const overrideUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL) ? import.meta.env.VITE_WS_URL : ''
    const wsUrl = overrideUrl || defaultUrl
    const ws = new WebSocket(wsUrl)
    socketRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', sessionId, role }))
      if (role === 'interviewer') {
        ws.send(JSON.stringify({ type: 'ready', sessionId, role }))
      }
    }

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'welcome') {
          return
        }
        if (msg.type === 'viewer-ready' && role === 'candidate') {
          await setupPeerForViewer(msg.from)
          return
        }
        if (msg.type === 'viewer-disconnected' && role === 'candidate') {
          const pc = peersRef.current.get(msg.from)
          if (pc) pc.close()
          peersRef.current.delete(msg.from)
          pendingIceRef.current.delete(msg.from)
          onRemoteStream?.({ id: msg.from, stream: null })
          if (peersRef.current.size === 0) {
            connectedRef.current = false
            setConnected(false)
          }
          return
        }
        if (msg.type === 'candidate-left' && role === 'interviewer') {
          const pc = peersRef.current.get(msg.from)
          if (pc) pc.close()
          peersRef.current.delete(msg.from)
          pendingIceRef.current.delete(msg.from)
          setConnected(false)
          onRemoteStream?.({ id: msg.from, stream: null })
          return
        }
        if (msg.type === 'signal') {
          const { from, signal } = msg
          if (signal.type === 'offer') {
            if (role === 'interviewer') {
              const pc = ensurePeerForCandidate(from)
              const desc = new RTCSessionDescription(signal.sdp)
              await pc.setRemoteDescription(desc)
              // Tracks already added in ensurePeerForCandidate if available
              const answer = await pc.createAnswer()
              await pc.setLocalDescription(answer)
              await flushPendingIce(from)
              sendMessage({ type: 'signal', to: 'candidate', signal: { type: 'answer', sdp: answer } })
              return
            }
            if (role === 'candidate') {
              const pc = peersRef.current.get(from) || createPeerForViewer(from)
              if (!pc) return
              const desc = new RTCSessionDescription(signal.sdp)
              await pc.setRemoteDescription(desc)
              const answer = await pc.createAnswer()
              await pc.setLocalDescription(answer)
              await flushPendingIce(from)
              sendMessage({ type: 'signal', to: from, signal: { type: 'answer', sdp: answer } })
              return
            }
          }
          if (signal.type === 'answer' && role === 'candidate') {
            const pc = peersRef.current.get(from)
            if (pc) {
              const desc = new RTCSessionDescription(signal.sdp)
              await pc.setRemoteDescription(desc)
              await flushPendingIce(from)
            }
            return
          }
          if (signal.type === 'candidate') {
            const pc = peersRef.current.get(from)
            if (pc) {
              try {
                const cand = new RTCIceCandidate(signal.candidate)
                if (pc.remoteDescription) {
                  await pc.addIceCandidate(cand)
                } else {
                  const list = pendingIceRef.current.get(from) || []
                  list.push(cand)
                  pendingIceRef.current.set(from, list)
                }
              } catch (err) {
                console.warn('Failed to add ICE candidate', err)
              }
            }
            return
          }
        }
        if (msg.type === 'event') {
          onEvent?.(msg.event)
          return
        }
        if (msg.type === 'ready-ack' && role === 'interviewer') {
          return
        }
      } catch (err) {
        console.warn('WS message error', err)
      }
    }

    ws.onclose = () => {
      peersRef.current.forEach((pc) => pc.close())
      peersRef.current.clear()
      pendingIceRef.current.clear()
      setConnected(false)
    }

    return () => {
      ws.close()
      peersRef.current.forEach((pc) => pc.close())
      peersRef.current.clear()
      pendingViewersRef.current.clear()
      pendingIceRef.current.clear()
      localStreamRef.current = null
    }
  }, [sessionId, role, ensurePeerForCandidate, onEvent, sendMessage, setupPeerForViewer, flushPendingIce])

  const setLocalStream = useCallback((stream) => {
    localStreamRef.current = stream
    if (!stream) return
    peersRef.current.forEach((pc) => {
      const senders = pc.getSenders()
      stream.getTracks().forEach((track) => {
        const existing = senders.find((sender) => sender.track && sender.track.kind === track.kind)
        if (existing) {
          existing.replaceTrack(track)
        } else {
          pc.addTrack(track, stream)
        }
      })
    })
    pendingViewersRef.current.forEach((viewerId) => {
      setupPeerForViewer(viewerId)
    })
    pendingViewersRef.current.clear()
    if (role === 'interviewer') {
      peersRef.current.forEach(async (pc) => {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          sendMessage({ type: 'signal', to: 'candidate', signal: { type: 'offer', sdp: offer } })
        } catch (err) {
          console.warn('Renegotiation failed', err)
        }
      })
    }
  }, [role, sendMessage, setupPeerForViewer])

  const sendEvent = useCallback((event) => {
    sendMessage({ type: 'event', event })
  }, [sendMessage])

  return useMemo(() => ({
    setLocalStream,
    sendEvent,
    connected,
  }), [connected, sendEvent, setLocalStream])
}
