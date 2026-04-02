import { useState, useEffect, useRef, FormEvent, ReactNode, DragEvent, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useImportRecipe, useImportJobStatus, ImportResult } from '../api/recipes'
import { Button } from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'

type TabId = 'url' | 'instagram' | 'text' | 'photo'
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'url',       label: 'Web URL',    icon: '🔗' },
  { id: 'instagram', label: 'Instagram',  icon: '📸' },
  { id: 'text',      label: 'Paste Text', icon: '📋' },
  { id: 'photo',     label: 'Photo',      icon: '📷' },
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

// ---------------------------------------------------------------------------
// Image compression helper — resizes to max 1600px, encodes as JPEG data URL
// ---------------------------------------------------------------------------
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const MAX = 1600
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not available')); return }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image')) }
    img.src = objectUrl
  })
}

// ---------------------------------------------------------------------------
// Photo drop zone component
// ---------------------------------------------------------------------------
function PhotoDropZone({ dataUrl, onFile, onClear, disabled }: {
  dataUrl: string
  onFile: (file: File) => void
  onClear: () => void
  disabled?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    onFile(file)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset input so the same file can be re-selected after clearing
    e.target.value = ''
  }

  if (dataUrl) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
          <img
            src={dataUrl}
            alt="Recipe preview"
            style={{ width: '100%', maxHeight: '320px', objectFit: 'cover', display: 'block' }}
          />
          {!disabled && (
            <button
              type="button"
              onClick={onClear}
              style={{
                position: 'absolute', top: '10px', right: '10px',
                background: 'rgba(0,0,0,0.55)', color: '#fff',
                border: 'none', borderRadius: '50%',
                width: '32px', height: '32px', fontSize: '16px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}
              title="Remove photo"
            >
              ×
            </button>
          )}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'transparent', border: 'none', padding: 0,
              fontSize: '13px', color: 'var(--color-text-muted)',
              cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--font-sans)',
              alignSelf: 'flex-start',
            }}
          >
            Choose a different photo
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleInputChange} />
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      style={{
        border: `2px dashed ${isDragging ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '48px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
        cursor: 'pointer',
        background: isDragging ? 'rgba(232,98,42,0.04)' : 'var(--color-surface)',
        transition: 'border-color 0.15s, background 0.15s',
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: '40px', lineHeight: 1 }}>📷</span>
      <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
        Drop a photo here, or click to choose
      </p>
      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0, maxWidth: '320px' }}>
        Take a photo of a recipe book, hand-written card, or any printed recipe.
        Works best with clear, well-lit images.
      </p>
      {/* capture="environment" triggers rear camera on mobile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ImportPage() {
  const navigate = useNavigate()
  const [tab, setTab]             = useState<TabId>('url')
  const [input, setInput]         = useState('')
  const [photoData, setPhotoData] = useState('')   // compressed base64 data URL
  const [photoLoading, setPhotoLoading] = useState(false)
  const [jobId, setJobId]         = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<ImportResult | null>(null)
  const [error, setError]         = useState('')
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null)

  const importMutation = useImportRecipe()
  const { data: jobStatus } = useImportJobStatus(jobId)

  if (jobStatus?.status === 'done' && jobStatus?.recipe_id) {
    navigate(`/recipes/${jobStatus.recipe_id}`)
  }

  const isInstagramBlocked = jobStatus?.error_message === 'INSTAGRAM_BLOCKED'
  const isFailed     = jobStatus?.status === 'failed'
  const isProcessing = !!jobId && !duplicate && jobStatus?.status !== 'done' && jobStatus?.status !== 'failed'

  // Auto-navigate to the duplicate recipe after a short delay
  useEffect(() => {
    if (!duplicate?.recipe_id) return
    const timer = setTimeout(() => navigate(`/recipes/${duplicate.recipe_id}`), 2000)
    return () => clearTimeout(timer)
  }, [duplicate, navigate])

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

  async function handlePhotoFile(file: File) {
    setError('')
    setPhotoLoading(true)
    try {
      const dataUrl = await compressImage(file)
      setPhotoData(dataUrl)
    } catch {
      setError('Could not read that image. Please try a different file.')
    } finally {
      setPhotoLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const sourceInput = tab === 'photo' ? photoData : input.trim()

    if (!sourceInput) {
      setError(tab === 'photo' ? 'Please select a photo first.' : 'Please enter a value.')
      return
    }

    try {
      const result = await importMutation.mutateAsync({ source_type: tab, source_input: sourceInput })
      if (result.duplicate && result.recipe_id) {
        setDuplicate(result)
      } else {
        setJobId(result.jobId)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Import failed. Please try again.'
      setError(msg)
    }
  }

  function handleReset() {
    setJobId(null); setDuplicate(null); setError(''); setPhotoData(''); importMutation.reset()
  }

  function switchTab(id: TabId) {
    setTab(id); setError(''); setJobId(null); setDuplicate(null); setBlockedUrl(null)
    if (id !== 'photo') setPhotoData('')
  }

  const processingDescription = tab === 'photo'
    ? 'Reading your photo and extracting the recipe — this takes about 15 seconds.'
    : jobStatus?.status === 'processing'
      ? 'Scraping page and parsing recipe content — this takes about 10 seconds.'
      : 'Job queued, starting shortly...'

  return (
    <div style={{ maxWidth: '600px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Import a Recipe</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '32px' }}>
        Import from a website URL, Instagram post, pasted text, or a photo of a recipe book.
      </p>

      <div style={{
        display: 'flex', gap: '4px', marginBottom: '28px',
        background: 'var(--color-border)', padding: '4px',
        borderRadius: 'var(--radius-md)', width: '100%',
      }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => switchTab(t.id)} style={{
            flex: 1, minWidth: 0,
            padding: '7px 4px', borderRadius: 'var(--radius-sm)', border: 'none',
            fontSize: '13px', fontWeight: 500, cursor: 'pointer',
            background: tab === t.id ? 'var(--color-surface)' : 'transparent',
            color: tab === t.id ? 'var(--color-text)' : 'var(--color-text-muted)',
            boxShadow: tab === t.id ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.15s', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '5px',
            fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden',
          }}>
            <span style={{ flexShrink: 0 }}>{t.icon}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
          </button>
        ))}
      </div>

      {duplicate?.recipe_id && (
        <StatusCard
          icon="✅"
          title="Already in your collection"
          description="You've imported this recipe before. Taking you there now…"
          color="#16a34a"
          action={
            <Button variant="secondary" onClick={() => navigate(`/recipes/${duplicate.recipe_id!}`)}>
              View Recipe
            </Button>
          }
        />
      )}

      {isProcessing && !isInstagramBlocked && (
        <StatusCard icon="⏳" title="Importing your recipe..."
          description={processingDescription}
          color="var(--color-primary)" />
      )}

      {isFailed && !isInstagramBlocked && (
        <StatusCard icon="❌" title="Import failed"
          description={jobStatus?.error_message ?? 'Something went wrong. Please try again.'}
          color="#dc2626"
          action={<Button variant="secondary" onClick={handleReset}>Try again</Button>} />
      )}

      {!isProcessing && !isFailed && !duplicate && (
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
          {tab === 'photo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {photoLoading ? (
                <div style={{
                  border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)',
                  padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px',
                }}>
                  Preparing image…
                </div>
              ) : (
                <PhotoDropZone
                  dataUrl={photoData}
                  onFile={handlePhotoFile}
                  onClear={() => { setPhotoData(''); setError('') }}
                  disabled={importMutation.isPending}
                />
              )}
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Supports JPEG, PNG, and WebP. Images are compressed before upload.
                The photo will also be used as the recipe's cover image.
              </p>
            </div>
          )}
          {error && <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button
              type="submit"
              loading={importMutation.isPending}
              disabled={tab === 'photo' && !photoData && !photoLoading}
            >
              Import Recipe
            </Button>
            {(tab !== 'photo' && input) && (
              <Button type="button" variant="ghost" onClick={() => setInput('')}>Clear</Button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
