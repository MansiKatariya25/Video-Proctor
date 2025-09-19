# Video Proctoring System

A full‑stack web application for remote interview proctoring.

Key features
- Live Candidate ↔ Interviewer video using WebRTC (custom WS signaling).
- Computer‑vision proctoring: face presence, gaze, eye closure, drowsiness, and object detection (YOLO) with on‑screen HUD.
- Real‑time events and alerts (toasts for interviewer).
- Recording: interviewer can record candidate’s remote video.
- Reporting: generate JSON report and on‑demand PDF (server‑side with PDFKit).
- Scheduling flow: create interview, share candidate link, join monitor.
- Auth: email/password with persistent token.
- Modern UI (Tailwind) with glass cards.

Getting started
## Environment variables (.env)
Create a `.env` file in the project root. Example:

```
# Frontend (Vite)
VITE_BASE_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
# Optional — detection tuning
VITE_DISABLE_FACEMESH=false
VITE_YOLO_MODEL_URL=/public/models/yolov8s.onnx
VITE_YOLO_INPUT=640
VITE_YOLO_SCORE=0.35
VITE_YOLO_NMS_IOU=0.45
VITE_YOLO_OUTPUT_LAYOUT=nms

# Backend (server)
MONGO_URL=mongodb://127.0.0.1:27017/proctoring
MONGO_DB=VideoProctor
APP_ORIGIN=http://localhost:5173
PORT=3001
```

Notes
- VITE_BASE_URL is the API origin used by Axios and the dev proxy.
- VITE_WS_URL is the WebSocket signaling endpoint; if omitted, it’s derived from VITE_BASE_URL.
- APP_ORIGIN is used by the backend to build shareable candidate links in emails/UI.
- MONGO_URL/MONGO_DB configure MongoDB for sessions/events/reports.

## Run locally
1. Install deps: `npm install`
2. Start backend (terminal 1): `npm run server`
3. Start frontend (terminal 2): `npm run dev`
4. Open: `http://localhost:5173`

## Submission instructions
If your grader starts the server for you, include the `.env` above and mention:
- Backend: `node server/index.js` (reads PORT)
- Frontend: `npm run dev` (Vite will choose a free port and proxy to `VITE_BASE_URL`)
- Health: `GET /api/health` on the backend should return `{ ok: true }`.

Folder structure
- server/
  - index.js — Express app + WS signaling server (path /ws)
  - routes/
    - auth.js — signup/login/me
    - interviews.js — schedule, candidate join
    - sessions.js — upsert session start/end
    - events.js — persist proctoring events
    - reports.js — JSON report and PDF download
  - models/ — Mongoose schemas (User, Interview, Session, Event, Report)
  - middleware/auth.js — token auth
- src/
  - App.jsx — route switcher; ToastHost mounted
  - components/
    - ProctorLayout.jsx — candidate app (camera, CV, send events)
    - Toast.jsx — react‑toastify wrapper
  - pages/
    - Login.jsx / Signup.jsx — auth
    - Schedule.jsx — create interview, share candidate link, join monitor
    - Dashboard.jsx — list interviews, open monitor, download PDF
    - CandidateJoin.jsx — candidate preflight checks, redirect to /interview/{sessionId}
    - Monitor.jsx — interviewer side (receive stream, recording, report, end interview)
  - hooks/
    - useWebRTC.js — WebRTC connection + WS signaling
    - useCamera.js — camera/recording helper
    - useDetection.js — runs CV, emits live status and logs events
    - useSession.js — session id + persistence
  - lib/
    - axios.js — Axios instance + getWsUrl()
    - yolo.js — object detection
    - mediapipe.js — face/eye detection helpers
    - utils.js — helpers
  - index.css — Tailwind + theme utilities

Core flow
- Schedule (Interviewer)
  - Creates interview → gets candidate link and sessionId.
  - Can open Monitor (/monitor/{sessionId}).
- CandidateJoin (Candidate)
  - Opens candidate link (/candidate/{token}), verifies camera/mic.
  - Redirects to /interview/{sessionId} and starts camera.
- WebRTC
  - Signaling over WS (/ws). Candidate publishes AV; interviewer receives.
  - ICE servers: public Google STUN; add TURN for strict NATs if needed.
- Detection + Events
  - Candidate runs detection and emits events + live status; HUD drawn on canvas.
  - Interviewer sees HUD and receives live status (faces/looking/eye/objects).
- Recording (Interviewer)
  - Records remote stream (MediaRecorder) and can download .webm.
- Reporting
  - Generate JSON: GET /api/reports/{sessionId}
  - Download PDF: GET /api/reports/{sessionId}/pdf (layout with summary, objects, deductions, totals)
- End Interview (Interviewer)
  - Sends “interview-ended” event; candidate auto‑stops camera and shows banner.

Toasts (react‑toastify)
- Mounted in App via ToastHost.
- Use: import { toast } from 'src/components/Toast.jsx'
- Examples: toast({ type:'success', title:'Logged in' }), toast({ type:'error', title:'Report failed', message: err })

Dev notes
- Vite dev server proxies /api and /ws to backend via vite.config.js and env.
- If PDF opens in SPA route, ensure using absolute API origin (VITE_BASE_URL).
- For unstable FaceMesh, set VITE_DISABLE_FACEMESH=true to use FaceDetector fallback.

Security
- Tokens stored in localStorage for simplicity; production should use HTTPS and secure cookies.
- Add TURN for reliable WebRTC in corporate networks.

## Roadmap-future features
- Two‑way live screen sharing (candidate and interviewer) with quick toggle.
- Cloud recording upload and long‑term storage.
- Multi‑interviewer panel and group chat.

