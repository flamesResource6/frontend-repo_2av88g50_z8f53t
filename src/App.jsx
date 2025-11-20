import { useEffect, useRef, useState } from 'react'

// Robust backend URL detection so we avoid NetworkError
const API_BASE = (() => {
  try {
    const env = import.meta.env.VITE_BACKEND_URL
    if (env && typeof env === 'string') return env.replace(/\/$/, '')
  } catch {}
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location
    // Default backend port in this stack
    return `${protocol}//${hostname}:8000`
  }
  return ''
})()

async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, options)
    return res
  } catch (e) {
    // Transform low-level network errors into a clear message
    const hint = `Cannot reach backend at ${API_BASE}. Set VITE_BACKEND_URL in the frontend or ensure backend is running.`
    const err = new Error('Network error. ' + hint)
    err.cause = e
    throw err
  }
}

function NetworkStatusBanner() {
  const [error, setError] = useState('')

  const check = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/test`)
      if (!res.ok) throw new Error('Backend not ready')
      setError('')
    } catch (e) {
      const msg = e?.message || `Network error. Cannot reach backend at ${API_BASE}. Set VITE_BACKEND_URL in the frontend or ensure backend is running.`
      setError(msg)
    }
  }

  useEffect(() => {
    check()
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [])

  if (!error) return null
  return (
    <div className="mb-3 rounded-lg border px-3 py-2 text-xs bg-rose-900/30 border-rose-500/30 text-rose-100">
      {error}
    </div>
  )
}

function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', identifier: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('slash_user')
    if (saved) onAuthed(JSON.parse(saved))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'register') {
        const res = await apiFetch(`${API_BASE}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, username: form.username, email: form.email, password: form.password })
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed to register')
        const user = await res.json()
        localStorage.setItem('slash_user', JSON.stringify(user))
        onAuthed(user)
      } else {
        const res = await apiFetch(`${API_BASE}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: form.identifier, password: form.password })
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed to login')
        const user = await res.json()
        localStorage.setItem('slash_user', JSON.stringify(user))
        onAuthed(user)
      }
    } catch (err) {
      setError(err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto p-5 bg-slate-800/50 rounded-2xl border border-blue-500/20 mt-6">
      <h2 className="text-xl font-semibold text-white mb-3">{mode === 'register' ? 'Create account' : 'Welcome back'}</h2>
      {error && <div className="text-red-400 mb-3 text-sm">{error}</div>}
      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && (
          <>
            <input className="w-full px-3 py-2 rounded bg-slate-900/60 text-white" placeholder="Name" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} />
            <input className="w-full px-3 py-2 rounded bg-slate-900/60 text-white" placeholder="Username" value={form.username} onChange={e => setForm(v => ({ ...v, username: e.target.value }))} />
            <input className="w-full px-3 py-2 rounded bg-slate-900/60 text-white" placeholder="Email" value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} />
          </>
        )}
        {mode === 'login' && (
          <input className="w-full px-3 py-2 rounded bg-slate-900/60 text-white" placeholder="Username or Email" value={form.identifier} onChange={e => setForm(v => ({ ...v, identifier: e.target.value }))} />
        )}
        <input className="w-full px-3 py-2 rounded bg-slate-900/60 text-white" type="password" placeholder="Password" value={form.password} onChange={e => setForm(v => ({ ...v, password: e.target.value }))} />
        <button disabled={loading} className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 text-white">{loading ? 'Please wait…' : (mode === 'register' ? 'Sign up' : 'Log in')}</button>
      </form>
      <div className="mt-3 text-sm text-blue-200">
        {mode === 'register' ? (
          <button className="underline" onClick={() => setMode('login')}>Have an account? Log in</button>
        ) : (
          <button className="underline" onClick={() => setMode('register')}>New here? Create account</button>
        )}
      </div>
    </div>
  )
}

function Chat({ me, onLogout }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [peer, setPeer] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [type, setType] = useState('text')
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')

  // Voice note state
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [sendingVoice, setSendingVoice] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const sendPendingRef = useRef(false)

  // Conversations (home)
  const [convos, setConvos] = useState([])
  const [loadingConvos, setLoadingConvos] = useState(false)

  const loadConvos = async () => {
    if (!me) return
    try {
      setLoadingConvos(true)
      const res = await apiFetch(`${API_BASE}/conversations?user=${encodeURIComponent(me.username)}&limit=50`)
      if (res.ok) {
        const data = await res.json()
        const list = data.conversations || []
        setConvos(list)
        // Do NOT auto-open any conversation
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingConvos(false)
    }
  }

  useEffect(() => {
    loadConvos()
    const i = setInterval(loadConvos, 15000) // slower refresh
    return () => clearInterval(i)
  }, [me])

  useEffect(() => {
    const id = setInterval(async () => {
      if (!peer) return
      const url = `${API_BASE}/messages/history?user1=${me.username}&user2=${peer.username}&limit=200`
      try {
        const res = await apiFetch(url)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages)
        }
      } catch (e) {
        setError(e.message)
      }
    }, 5000) // slower refresh for messages
    return () => clearInterval(id)
  }, [me, peer])

  const search = async (q) => {
    setQuery(q)
    if (!q) return setResults([])
    try {
      const res = await apiFetch(`${API_BASE}/users/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setResults((data.results || []).filter(u => u.username !== me.username))
      }
    } catch (e) {
      setError(e.message)
    }
  }

  const send = async () => {
    setError('')
    if (!peer) return
    const fd = new FormData()
    fd.append('sender', me.username)
    fd.append('receiver', peer.username)
    fd.append('type', type)
    if (type === 'text') fd.append('text', text)
    if (file) fd.append('file', file)

    try {
      const res = await apiFetch(`${API_BASE}/messages/send`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to send')
      const data = await res.json()
      setText('')
      setFile(null)
      setMessages(m => [...m, data])
      loadConvos()
    } catch (e) {
      setError(e.message)
    }
  }

  const sendVoiceBlob = async (blob) => {
    if (!peer) return
    setSendingVoice(true)
    setError('')
    const fd = new FormData()
    fd.append('sender', me.username)
    fd.append('receiver', peer.username)
    fd.append('type', 'audio')
    const f = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
    fd.append('file', f)
    try {
      const res = await apiFetch(`${API_BASE}/messages/send`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to send voice note')
      const data = await res.json()
      setMessages(m => [...m, data])
      loadConvos()
    } catch (e) {
      setError(e.message)
    } finally {
      setSendingVoice(false)
    }
  }

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startRecording = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      sendPendingRef.current = false
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        // release mic
        stream.getTracks().forEach(t => t.stop())
        clearTimer()
        if (sendPendingRef.current) {
          await sendVoiceBlob(blob)
        }
        setRecording(false)
        setSeconds(0)
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
      setSeconds(0)
      clearTimer()
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch (e) {
      setError('Microphone permission denied')
      setRecording(false)
      setSeconds(0)
      clearTimer()
    }
  }

  const stopRecordingAndOptionallySend = (sendNow = false) => {
    sendPendingRef.current = sendNow
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') {
      mr.stop()
    } else {
      // if nothing to stop, just reset UI
      setRecording(false)
      setSeconds(0)
      clearTimer()
    }
  }

  const initials = (name, username) => {
    const n = (name || username || '').trim()
    const parts = n.split(' ').filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    if (parts.length === 1) return parts[0][0].toUpperCase()
    return (username || '?')[0].toUpperCase()
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatSeconds = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const ss = (s % 60).toString().padStart(2, '0')
    return `${m}:${ss}`
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg text-white font-semibold">Slash</h2>
        <div className="text-blue-200 text-xs">Signed in as <b>{me.username}</b> <button onClick={() => { localStorage.removeItem('slash_user'); onLogout() }} className="ml-2 underline">Log out</button></div>
      </div>

      {/* Only network status if needed */}
      <NetworkStatusBanner />

      {!peer ? (
        <div className="flex-1 bg-slate-800/50 p-3 rounded-xl border border-blue-500/20 overflow-y-auto">
          <div className="flex flex-col gap-3">
            <input value={query} onChange={e => search(e.target.value)} placeholder="Search username" className="w-full px-3 py-2 rounded bg-slate-900/60 text-white" />
            {results.length > 0 && (
              <div className="space-y-2">
                {results.map(u => (
                  <div key={u.id} className="flex items-center justify-between bg-slate-900/50 p-3 rounded hover:bg-slate-900/70 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-600/30 text-blue-200 flex items-center justify-center font-semibold">{initials(u.name, u.username)}</div>
                      <div className="text-blue-100">
                        @{u.username} <span className="text-blue-300/60">{u.name}</span>
                      </div>
                    </div>
                    <button onClick={() => setPeer(u)} className="px-3 py-1 rounded bg-blue-600 text-white">Chat</button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-medium">Recent chats</h3>
                {loadingConvos && <span className="text-xs text-blue-300/70">Updating…</span>}
              </div>
              {convos.length === 0 ? (
                <div className="text-blue-300/70 text-sm">No conversations yet. Start one by searching above.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {convos.map(c => (
                    <button key={c.peer} onClick={() => setPeer({ id: c.peer_id, name: c.peer_name, username: c.peer })} className="text-left group p-3 rounded-xl border border-blue-500/20 bg-slate-900/40 hover:bg-slate-900/70 transition flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-lg">
                        {initials(c.peer_name, c.peer)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="text-white truncate">{c.peer_name || c.peer}</div>
                          <div className="text-[10px] text-blue-300/70 ml-2 shrink-0">{formatTime(c.last?.created_at)}</div>
                        </div>
                        <div className="text-xs text-blue-200/80 truncate mt-0.5">
                          {c.last?.type === 'text' ? (c.last?.text || '') : c.last?.type === 'image' ? '📷 Photo' : c.last?.type === 'video' ? '🎥 Video' : '🎤 Voice'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {error && <div className="mt-3 text-red-400 text-sm">{error}</div>}
        </div>
      ) : (
        <div className="flex-1 bg-slate-800/50 rounded-xl border border-blue-500/20 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-blue-500/20 flex items-center justify-between">
            <div className="text-white font-medium text-sm">@{peer.username}</div>
            <button onClick={() => setPeer(null)} className="text-blue-300 underline text-xs">Back</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map(m => (
              <div key={m.id} className={`max-w-[80%] px-3 py-2 rounded-xl ${m.sender === me.username ? 'bg-blue-600 text-white ml-auto' : 'bg-slate-900 text-blue-100'}`}>
                {m.type === 'text' && <div className="text-sm">{m.text}</div>}
                {m.type !== 'text' && m.media_url && (
                  m.type === 'image' ? (
                    <img src={`${API_BASE}${m.media_url}`} className="rounded" />
                  ) : m.type === 'video' ? (
                    <video src={`${API_BASE}${m.media_url}`} controls className="rounded max-w-full" />
                  ) : (
                    <audio src={`${API_BASE}${m.media_url}`} controls />
                  )
                )}
                <div className="text-[10px] opacity-70 mt-1">{new Date(m.created_at).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-blue-500/20 grid grid-cols-12 gap-2 items-center">
            <select value={type} onChange={e => setType(e.target.value)} className="col-span-3 px-2 py-2 rounded bg-slate-900/60 text-white text-xs">
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
            </select>
            {type === 'text' ? (
              <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a message" className="col-span-6 px-3 py-2 rounded bg-slate-900/60 text-white text-sm" />
            ) : (
              <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="col-span-6 text-blue-100 text-xs" accept={type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*'} />
            )}

            {/* Voice recorder - mic icon; when recording show only timer and send icon */}
            <div className="col-span-2 flex items-center justify-end gap-2">
              {!recording ? (
                <button onClick={startRecording} className="h-9 w-9 flex items-center justify-center rounded-full bg-slate-600 text-white text-lg" title="Record" disabled={!peer || sendingVoice}>🎤</button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 rounded bg-slate-700 text-white text-xs font-mono">{formatSeconds(seconds)}</div>
                  <button onClick={() => stopRecordingAndOptionallySend(true)} className="h-9 w-9 flex items-center justify-center rounded-full bg-blue-600 text-white text-lg" title="Send">📤</button>
                </div>
              )}
            </div>

            <div className="col-span-1">
              <button onClick={send} className="w-full rounded bg-blue-600 text-white py-2 text-sm" disabled={!peer}>Send</button>
            </div>
          </div>
          {error && <div className="px-3 pb-2 text-red-400 text-xs">{error}</div>}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [me, setMe] = useState(null)
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
      {/* Android phone-sized frame */}
      <div className="w-[380px] max-w-[420px] h-[700px] sm:h-[780px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[32px] shadow-2xl border border-white/10 overflow-hidden flex flex-col">
        <div className="p-4">
          <h1 className="text-2xl font-bold">Slash</h1>
          <p className="text-blue-300/80 text-xs">Android-style chat with robust storage</p>
          {/* Global network status on home page */}
          <NetworkStatusBanner />
        </div>
        <div className="px-4 pb-4 flex-1 overflow-hidden">
          {!me ? <Auth onAuthed={setMe} /> : <Chat me={me} onLogout={() => setMe(null)} />}
        </div>
      </div>
    </div>
  )
}
