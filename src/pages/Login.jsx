import { useState } from 'react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Login failed')
      localStorage.setItem('auth.token', data.token)
      localStorage.setItem('auth.user', JSON.stringify(data.user))
      location.href = '/schedule'
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Interviewer Login</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input className="w-full border rounded px-2 py-1" value={email} onChange={(e)=>setEmail(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1">Password</label>
          <input type="password" className="w-full border rounded px-2 py-1" value={password} onChange={(e)=>setPassword(e.target.value)} />
        </div>
        <button className="btn w-full" type="submit">Login</button>
        {error && <div className="text-rose-600 text-sm">{error}</div>}
        <div className="text-sm mt-2">No account? <a className="text-sky-700 underline" href="/signup">Sign up</a></div>
      </form>
    </div>
  )
}
