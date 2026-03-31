import { useState, useEffect, FormEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useImportRecipe, useImportJobStatus } from '../api/recipes'
import { Button } from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'

type TabId = 'url' | 'instagram' | 'text'
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'url',       label: 'Web URL',    icon: '🔗' },
  { id: 'instagram', label: 'Instagram',  icon: '📸' },
  { id: 'text',      label: 'Paste Text', icon: '📋' },
]

function StatusCard({ icon, title, description, color, action }: {
  icon: string; title: string; description: string; color: string; action?: ReactNode
}) {
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '28px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', gap: '12px', marginBottom: '24px',
    }}>
      <span style={{ fontSize: '36px' }}>{icon}</span>
      <p style={{ fontSize: '16px', fontWeight: 600, color }}>{title}</p>
      <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', maxWidth: '400px' }}>{description}</p>
      {action}
    </div>
  )
}

export default function ImportPage() {
  const navigate = useNavigate()
  const [tab, setTab]           = useState<TabId>('url')
  const [input, setInput]       = useState('')
  const [jobId, setJobId]       = useState<string | null>(null)
  const [error, setError]       = useState('')
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null)

  const importMutation = useImportRecipe()
  const { data: jobStatus } = useImportJobStatus(jobId)

  if (jobStatus?.status === 'done' && jobStatus?.recipe_id) {
    navigate(`/recipes/${jobStatus.recipe_id}`)
  }

  const isInstagramBlocked = jobStatus?.error_message === 'INSTAGRAM_BLOCKED'
  const isFailed     = jobStatus?.status === 'failed'
  const isProcessing = !!jobId && jobStatus?.status !== 'done' && jobStatus?.status !== 'failed'

  // Auto-switch to Paste Text when Instagram scraping is blocked
  useEffect(() => {
    if (isInstagramBlocked) {
      setBlockedUrl(input)
      setTab('text')
      setInput('')
      setJobId(null)
      importMutation.reset()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstagramBlocked])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!input.trim()) { setError('Please enter a value.'); return }
    try {
      const result = await importMutation.mutateAsync({ source_type: tab, source_input: input.trim() })
      setJobId(result.jobId)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Import failed. Please try again.'
      setError(msg)
    }
  }

  function handleReset() { setJobId(null); setError(''); importMutation.reset() }
  function switchTab(id: TabId) { setTab(id); setError(''); setJobId(null); setBlockedUrl(null) }

  return (
    <div style={{ maxWidth: '600px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Import a Recipe</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '32px' }}>
        Import from a website URL, Instagram post, or paste the recipe text directly.
      </p>

      <div style={{
        display: 'flex', gap: '4px', marginBottom: '28px',
        background: 'var(--color-border)', padding: '4px',
        borderRadius: 'var(--radius-md)', width: 'fit-content',
      }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => switchTab(t.id)} style={{
            padding: '7px 18px', borderRadius: 'var(--radius-sm)', border: 'none',
            fontSize: '13px', fontWeight: 500, cursor: 'pointer',
            background: tab === t.id ? 'var(--color-surface)' : 'transparent',
            color: tab === t.id ? 'var(--color-text)' : 'var(--color-text-muted)',
            boxShadow: tab === t.id ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px',
            fontFamily: 'var(--font-sans)',
          }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {isProcessing && !isInstagramBlocked && (
        <StatusCard icon="⏳" title="Importing your recipe..."
          description={jobStatus?.status === 'processing'
            ? 'Scraping page and parsing recipe content — this takes about 10 seconds.'
            : 'Job queued, starting shortly...'}
          color="var(--color-primary)" />
      )}

      {isFailed && !isInstagramBlocked && (
        <StatusCard icon="❌" title="Import failed"
          description={jobStatus?.error_message ?? 'Something went wrong. Please try again.'}
          color="#dc2626"
          action={<Button variant="secondary" onClick={handleReset}>Try again</Button>} />
      )}

      {!isProcessing && !isFailed && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {tab === 'url' && (
            <Input label="Recipe URL" type="url" value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://www.example.com/recipes/pasta" autoFocus />
          )}
          {tab === 'instagram' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Input label="Instagram post URL" type="url" value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://www.instagram.com/p/..." autoFocus />
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Only public posts are supported. If Instagram blocks the import, you will be prompted to paste the caption instead.
              </p>
            </div>
          )}
          {tab === 'text' && (
            <>
              {blockedUrl && (
                <div style={{
                  background: '#fff7ed', border: '1px solid #fed7aa',
                  borderRadius: 'var(--radius-md)', padding: '14px 16px',
                  display: 'flex', flexDirection: 'column', gap: '6px',
                }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>
                    Instagram blocked the automatic import
                  </p>
                  <p style={{ fontSize: '13px', color: '#78350f', lineHeight: 1.5 }}>
                    Open{' '}
                    <a href={blockedUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#c2410c', fontWeight: 500 }}>
                      this post
                    </a>
                    , tap the three-dot menu → <strong>Copy text</strong>, then paste it below.
                  </p>
                </div>
              )}
              <Textarea label="Recipe text" value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste the full recipe here — title, ingredients, and steps."
                style={{ minHeight: '240px' }} autoFocus />
            </>
          )}
          {error && <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button type="submit" loading={importMutation.isPending}>Import Recipe</Button>
            {input && <Button type="button" variant="ghost" onClick={() => setInput('')}>Clear</Button>}
          </div>
        </form>
      )}
    </div>
  )
}
