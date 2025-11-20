import { useEffect, useMemo, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_BACKEND_URL || ''

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', username_or_email: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        const res = await fetch(`${API_BASE}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, username: form.username, email: form.email, password: form.password })
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed')
        const data = await res.json()
        onAuth(data)
      } else {
        const res = await fetch(`${API_BASE}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username_or_email: form.username_or_email || form.username, password: form.password })
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed')
        const data = await res.json()
        onAuth(data)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 text-white p-4">
      <div className="w-full max-w-md bg-white/10 backdrop-blur rounded-2xl p-6 shadow-xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Slash</h1>
        <p className="text-center mb-6 text-slate-300">{mode === 'register' ? 'Create your account' : 'Welcome back'}</p>
        <div className="flex gap-2 mb-6">
          <button className={`flex-1 py-2 rounded-lg ${mode==='login'?'bg-indigo-600':'bg-slate-700'}`} onClick={()=>setMode('login')}>Login</button>
          <button className={`flex-1 py-2 rounded-lg ${mode==='register'?'bg-indigo-600':'bg-slate-700'}`} onClick={()=>setMode('register')}>Create Account</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode==='register' && (
            <>
              <input className="w-full bg-slate-800 rounded px-3 py-2" placeholder="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required />
              <input className="w-full bg-slate-800 rounded px-3 py-2" placeholder="Username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} required />
              <input className="w-full bg-slate-800 rounded px-3 py-2" placeholder="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required />
            </>
          )}
          {mode==='login' && (
            <input className="w-full bg-slate-800 rounded px-3 py-2" placeholder="Username or Email" value={form.username_or_email} onChange={e=>setForm({...form,username_or_email:e.target.value})} required />
          )}
          <input className="w-full bg-slate-800 rounded px-3 py-2" placeholder="Password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required />
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <button disabled={loading} className="w-full py-2 bg-indigo-600 rounded-lg disabled:opacity-60">{loading? 'Please wait...' : (mode==='register'?'Create Account':'Login')}</button>
        </form>
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
  const [file, setFile] = useState(null)
  const [type, setType] = useState('text')

  useEffect(() => {
    if (peer) {
      loadHistory()
      const id = setInterval(loadHistory, 3000)
      return ()=>clearInterval(id)
    }
  }, [peer])

  const search = async () => {
    if (!query.trim()) return
    const res = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(query)}`)
    if (res.ok) setResults(await res.json())
  }

  const loadHistory = async () => {
    const res = await fetch(`${API_BASE}/messages/history?user1=${me.username}&user2=${peer.username}&limit=100`)
    if (res.ok) setMessages(await res.json())
  }

  const send = async () => {
    const form = new FormData()
    form.append('sender', me.username)
    form.append('receiver', peer.username)
    form.append('type', type)
    if (type === 'text') {
      form.append('text', text)
    } else if (file) {
      form.append('file', file)
    }
    const res = await fetch(`${API_BASE}/messages/send`, {
      method: 'POST',
      body: form
    })
    if (res.ok) {
      setText(''); setFile(null)
      await loadHistory()
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-3 bg-slate-900 text-white">
      <div className="md:col-span-1 border-r border-white/10 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">{me.name}</div>
            <div className="text-xs text-slate-400">@{me.username}</div>
          </div>
          <button className="text-sm text-red-400" onClick={onLogout}>Logout</button>
        </div>
        <div className="flex gap-2">
          <input className="flex-1 bg-slate-800 rounded px-3 py-2" placeholder="Search username" value={query} onChange={e=>setQuery(e.target.value)} />
          <button onClick={search} className="bg-indigo-600 rounded px-3">Go</button>
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-auto pr-2">
          {results.map(u => (
            <div key={u.id} onClick={()=>setPeer(u)} className={`p-2 rounded cursor-pointer ${peer?.username===u.username?'bg-indigo-600':'bg-slate-800'}`}>
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-slate-400">@{u.username}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="md:col-span-2 flex flex-col h-screen p-4">
        {!peer ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">Search and select a person to start chatting.</div>
        ) : (
          <>
            <div className="pb-2 border-b border-white/10 font-semibold">Chat with @{peer.username}</div>
            <div className="flex-1 overflow-auto space-y-2 py-3">
              {messages.map((m)=> (
                <div key={m.id} className={`max-w-[75%] p-2 rounded shadow ${m.sender===me.username?'ml-auto bg-indigo-600':'bg-slate-800'}`}>
                  {m.type==='text' && <div>{m.text}</div>}
                  {m.media_url && (
                    m.type==='image' ? <img src={`${API_BASE}${m.media_url}`} className="rounded" /> :
                    m.type==='video' ? <video src={`${API_BASE}${m.media_url}`} controls className="rounded" /> :
                    m.type==='audio' ? <audio src={`${API_BASE}${m.media_url}`} controls /> : null
                  )}
                  <div className="text-[10px] text-white/70 mt-1">{new Date(m.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select className="bg-slate-800 rounded px-2 py-2" value={type} onChange={e=>setType(e.target.value)}>
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
              </select>
              {type==='text' ? (
                <input className="flex-1 bg-slate-800 rounded px-3 py-2" placeholder="Type a message" value={text} onChange={e=>setText(e.target.value)} />
              ) : (
                <input type="file" accept={type==='image'? 'image/*' : type==='video'? 'video/*' : 'audio/*'} onChange={e=>setFile(e.target.files?.[0])} className="flex-1" />
              )}
              <button onClick={send} className="bg-indigo-600 rounded px-4 py-2">Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [me, setMe] = useState(null)
  useEffect(()=>{
    const saved = localStorage.getItem('slash_user')
    if (saved) setMe(JSON.parse(saved))
  },[])
  const onAuth = (user) => { setMe(user); localStorage.setItem('slash_user', JSON.stringify(user)) }
  const onLogout = () => { setMe(null); localStorage.removeItem('slash_user') }
  return me ? <Chat me={me} onLogout={onLogout} /> : <Auth onAuth={onAuth} />
}
