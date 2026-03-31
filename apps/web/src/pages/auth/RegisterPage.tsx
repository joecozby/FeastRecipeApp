import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import client from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await client.post('/auth/register', {
        email,
        password,
        display_name: displayName,
      })
      setAuth(data.token, data.user)
      navigate('/recipes')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? 'Registration failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg)', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        padding: '40px',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '4px' }}>
            Feast
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--color-text-muted)' }}>
            Create your account
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Your name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Julia Child"
            required
            autoFocus
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            minLength={8}
            required
          />

          {error && (
            <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>{error}</p>
          )}

          <Button type="submit" loading={loading} size="lg" style={{ marginTop: '4px' }}>
            Create account
          </Button>
        </form>

        <p style={{ marginTop: '24px', fontSize: '14px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
