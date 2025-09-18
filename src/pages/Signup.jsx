import { useState } from 'react'
import api from '../lib/axios.js'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const { data } = await api.post('/api/auth/signup', { name, email, password })
      if (!data?.ok) throw new Error(data?.error || 'Signup failed')
      localStorage.setItem('auth.token', data.token)
      localStorage.setItem('auth.user', JSON.stringify(data.user))
      location.href = '/schedule'
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Create Interviewer Account</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">Name</label>
          <input className="w-full border rounded px-2 py-1" value={name} onChange={(e)=>setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input className="w-full border rounded px-2 py-1" value={email} onChange={(e)=>setEmail(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1">Password</label>
          <input type="password" className="w-full border rounded px-2 py-1" value={password} onChange={(e)=>setPassword(e.target.value)} />
        </div>
        <button className="btn w-full" type="submit">Sign Up</button>
        {error && <div className="text-rose-600 text-sm">{error}</div>}
        <div className="text-sm mt-2">Already have an account? <a className="text-sky-700 underline" href="/login">Login</a></div>
      </form>
    </div>
  )
}
