import { useState, FormEvent, useEffect } from 'react'
import { useProfile, useUpdateProfile } from '../api/profile'
import { useAuthStore } from '../store/authStore'
import queryClient from '../api/queryClient'
import { Button } from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'
import client from '../api/client'

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const _logout = useAuthStore((s) => s.logout)
  const logout = () => { queryClient.clear(); _logout() }

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [renormalizing, setRenormalizing] = useState(false)
  const [renormalizeResult, setRenormalizeResult] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name ?? '')
    setBio(profile.bio ?? '')
  }, [profile])

  async function handleRenormalize() {
    setRenormalizing(true)
    setRenormalizeResult(null)
    try {
      const { data } = await client.post('/recipes/renormalize')
      setRenormalizeResult(
        `Done — ${data.ingredients_updated} ingredient${data.ingredients_updated === 1 ? '' : 's'} updated, ` +
        `${data.ingredients_unchanged} already correct.` +
        (data.grocery_rebuilt ? ' Grocery list refreshed.' : '')
      )
      queryClient.invalidateQueries({ queryKey: ['grocery'] })
    } catch {
      setRenormalizeResult('Something went wrong. Please try again.')
    } finally {
      setRenormalizing(false)
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await updateProfile.mutateAsync({
        display_name: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      })
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Save failed. Please try again.')
    }
  }

  if (isLoading) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading...</div>
  }

  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null

  return (
    <div style={{ maxWidth: '520px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '28px' }}>Profile</h1>

      {/* Avatar + name card */}
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)', padding: '28px', marginBottom: '28px',
        display: 'flex', alignItems: 'center', gap: '20px',
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '26px', color: '#fff', fontWeight: 700,
        }}>
          {(profile?.display_name ?? profile?.email ?? '?')[0].toUpperCase()}
        </div>
        <div>
          <p style={{ fontSize: '18px', fontWeight: 700 }}>{profile?.display_name ?? 'No display name'}</p>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{profile?.email}</p>
          {joinedDate && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Joined {joinedDate}</p>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing ? (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoFocus
          />
          <Textarea
            label="Bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us a little about yourself..."
            style={{ minHeight: '100px' }}
          />
          {error && <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button type="submit" loading={updateProfile.isPending}>Save</Button>
            <Button type="button" variant="ghost" onClick={() => { setEditing(false); setError('') }}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div style={{ marginBottom: '28px' }}>
          {profile?.bio && (
            <div style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: '16px',
            }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>Bio</p>
              <p style={{ fontSize: '14px', lineHeight: 1.6 }}>{profile.bio}</p>
            </div>
          )}
          <Button variant="secondary" onClick={() => setEditing(true)}>Edit Profile</Button>
          {saved && <span style={{ fontSize: '13px', color: '#16a34a', marginLeft: '12px' }}>Saved!</span>}
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', marginBottom: '24px' }} />

      {/* Account section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Account</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 500 }}>Email</p>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{profile?.email}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--color-border)' }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 500 }}>Sign out</p>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>You will need to sign back in to access your recipes.</p>
          </div>
          <Button variant="danger" onClick={logout}>Sign Out</Button>
        </div>
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Data Tools</p>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: 500, marginBottom: '2px' }}>Fix ingredient matching</p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                Re-analyzes all your recipe ingredients and merges duplicates like
                "extra-virgin olive oil" → "olive oil" and "small garlic clove" → "garlic".
                Run this once after updating the app.
              </p>
              {renormalizeResult && (
                <p style={{ fontSize: '13px', marginTop: '8px', color: renormalizeResult.includes('wrong') ? '#dc2626' : '#16a34a' }}>
                  {renormalizeResult}
                </p>
              )}
            </div>
            <Button variant="secondary" onClick={handleRenormalize} loading={renormalizing} style={{ flexShrink: 0 }}>
              {renormalizing ? 'Fixing...' : 'Fix Now'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
