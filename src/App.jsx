import { useEffect, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_BACKEND_URL || ''

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
        const res = await fetch(`${API_BASE}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, username: form.username, email: form.email, password: form.password })
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed to register')
        const user = await res.json()
        localStorage.setItem('slash_user', JSON.stringify(user))
        onAuthed(user)
      } else {
        const res = await fetch(`${API_BASE}/login`, {
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
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-slate-800/50 rounded-2xl border border-blue-500/20 mt-12">
      <h2 className="text-2xl font-semibold text-white mb-4">{mode === 'register' ? 'Create account' : 'Welcome back'}</h2>
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
      <div className="mt-3 text-sm text-blue-2 00">
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
  const [paused, setPaused] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  useEffect(() => {
    const id = setInterval(async () => {
      if (!peer) return
      const url = `${API_BASE}/messages/history?user1=${me.username}&user2=${peer.username}&limit=200`
      try {
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages)
        }
      } catch {}
    }, 3000)
    return () => clearInterval(id)
  }, [me, peer])

  const search = async (q) => {
    setQuery(q)
    if (!q) return setResults([])
    try {
      const res = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.results.filter(u => u.username !== me.username))
      }
    } catch {}
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
      const res = await fetch(`${API_BASE}/messages/send`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to send')
      const data = await res.json()
      setText('')
      setFile(null)
      setMessages(m => [...m, data])
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
      const res = await fetch(`${API_BASE}/messages/send`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to send voice note')
      const data = await res.json()
      setMessages(m => [...m, data])
    } catch (e) {
      setError(e.message)
    } finally {
      setSendingVoice(false)
    }
  }

  const startRecording = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        // release mic
        stream.getTracks().forEach(t => t.stop())
        await sendVoiceBlob(blob) // auto-send after stop
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
      setPaused(false)
    } catch (e) {
      setError('Microphone permission denied')
      setRecording(false)
      setPaused(false)
    }
  }

  const pauseRecording = () => {
    const mr = mediaRecorderRef.current
    if (mr && mr.state === 'recording') {
      mr.pause()
      setPaused(true)
    }
  }

  const resumeRecording = () => {
    const mr = mediaRecorderRef.current
    if (mr && mr.state === 'paused') {
      mr.resume()
      setPaused(false)
    }
  }

  const stopRecording = () => {
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') {
      mr.stop()
    }
    setRecording(false)
    setPaused(false)
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl text-white font-semibold">Slash</h2>
        <div className="text-blue-200 text-sm">Signed in as <b>{me.username}</b> <button onClick={() => { localStorage.removeItem('slash_user'); onLogout() }} className="ml-3 underline">Log out</button></div>
      </div>

      {!peer ? (
        <div className="bg-slate-800/50 p-4 rounded-xl border border-blue-500/20">
          <input value={query} onChange={e => search(e.target.value)} placeholder="Search username" className="w-full px-3 py-2 rounded bg-slate-900/60 text-white" />
          <div className="mt-3 space-y-2">
            {results.map(u => (
              <div key={u.id} className="flex items-center justify-between bg-slate-900/50 p-3 rounded">
                <div className="text-blue-100">@{u.username} <span className="text-blue-300/60">{u.name}</span></div>
                <button onClick={() => setPeer(u)} className="px-3 py-1 rounded bg-blue-600 text-white">Chat</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-blue-500/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-500/20 flex items-center justify-between">
            <div className="text-white font-medium">@{peer.username}</div>
            <button onClick={() => setPeer(null)} className="text-blue-300 underline">Change</button>
          </div>
          <div className="h-[60vh] overflow-y-auto p-4 space-y-3">
            {messages.map(m => (
              <div key={m.id} className={`max-w-[75%] px-3 py-2 rounded-xl ${m.sender === me.username ? 'bg-blue-600 text-white ml-auto' : 'bg-slate-900 text-blue-100'}`}>
                {m.type === 'text' && <div>{m.text}</div>}
                {m.type !== 'text' && m.media_url && (
                  m.type === 'image' ? (
                    <img src={`${API_BASE}${m.media_url}`} className="rounded" />
                  ) : m.type === 'video' ? (
                    <video src={`${API_BASE}${m.media_url}`} controls className="rounded max-w-full" />
                  ) : (
                    <audio src={`${API_BASE}${m.media_url}`} controls />
                  )
                )}
                <div className="text-xs opacity-70 mt-1">{new Date(m.created_at).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-blue-500/20 grid grid-cols-12 gap-2 items-center">
            <select value={type} onChange={e => setType(e.target.value)} className="col-span-2 px-2 py-2 rounded bg-slate-900/60 text-white">
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
            </select>
            {type === 'text' ? (
              <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a message" className="col-span-6 px-3 py-2 rounded bg-slate-900/60 text-white" />
            ) : (
              <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="col-span-6 text-blue-100" accept={type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*'} />
            )}

            {/* Voice recorder controls - always visible */}
            <div className="col-span-3 flex items-center gap-2">
              {!recording && (
                <button onClick={startRecording} className="px-3 py-2 rounded bg-slate-600 text-white" disabled={!peer || sendingVoice}>
                  {sendingVoice ? 'Sending…' : 'Record'}
                </button>
              )}
              {recording && (
                <>
                  {!paused ? (
                    <button onClick={pauseRecording} className="px-3 py-2 rounded bg-yellow-600 text-white">Pause</button>
                  ) : (
                    <button onClick={resumeRecording} className="px-3 py-2 rounded bg-green-600 text-white">Resume</button>
                  )}
                  <button onClick={stopRecording} className="px-3 py-2 rounded bg-red-600 text-white">Stop</button>
                </>
              )}
            </div>

            <div className="col-span-1">
              <button onClick={send} className="w-full rounded bg-blue-600 text-white py-2" disabled={!peer}>Send</button>
            </div>
          </div>
          {error && <div className="px-4 pb-3 text-red-400 text-sm">{error}</div>}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [me, setMe] = useState(null)
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">Slash</h1>
        <p className="text-blue-300/80 mb-6">Android-style chat with Google Sheets backend</p>
        {!me ? <Auth onAuthed={setMe} /> : <Chat me={me} onLogout={() => setMe(null)} />}
      </div>
    </div>
  )
}
