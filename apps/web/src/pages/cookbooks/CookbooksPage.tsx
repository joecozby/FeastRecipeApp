import { useState, useEffect, useRef, FormEvent, CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useCookbooks, useCreateCookbook, useDeleteCookbook, useReorderCookbooks,
  CookbookSummary,
} from '../../api/cookbooks'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useConfirm } from '../../components/ui/ConfirmModal'
import { EmptyState } from '../../components/ui/EmptyState'
import { useMobile } from '../../hooks/useMobile'
import { LibrarySelector } from '../../components/ui/LibrarySelector'

function reorder<T>(list: T[], fromIdx: number, toIdx: number): T[] {
  const next = [...list]
  const [moved] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, moved)
  return next
}

// ---------------------------------------------------------------------------
// Collage cover — shows 1-4 recipe cover photos in a grid
// ---------------------------------------------------------------------------
function CookbookCollage({ photos, height = 140 }: { photos: string[]; height?: number }) {
  const n = Math.min(photos.length, 4)

  // No recipe photos — fall back to orange gradient placeholder
  if (n === 0) {
    return (
      <div style={{
        height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
        fontSize: '48px',
      }}>
        📖
      </div>
    )
  }

  const imgStyle: CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }

  // 3-photo: flexbox row — large left (50%) + right column of two stacked (50%)
  if (n === 3) {
    return (
      <div style={{ height, display: 'flex', gap: '2px', overflow: 'hidden' }}>
        <div style={{ flex: '0 0 50%', height: '100%' }}>
          <img src={photos[0]} alt="" draggable={false} style={{ ...imgStyle }} />
        </div>
        <div style={{ flex: '0 0 calc(50% - 2px)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <img src={photos[1]} alt="" draggable={false} style={{ ...imgStyle }} />
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <img src={photos[2]} alt="" draggable={false} style={{ ...imgStyle }} />
          </div>
        </div>
      </div>
    )
  }

  // 1, 2, or 4 photos — grid
  const gridStyle: CSSProperties = {
    height,
    display: 'grid',
    gap: '2px',
    overflow: 'hidden',
    gridTemplateColumns: n === 1 ? '1fr' : '1fr 1fr',
    gridTemplateRows: n <= 2 ? '1fr' : '1fr 1fr',
  }

  return (
    <div style={gridStyle}>
      {photos.slice(0, n).map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          draggable={false}
          style={imgStyle}
        />
      ))}
    </div>
  )
}

function CookbookCard({
  cookbook,
  isDragging,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  cookbook: CookbookSummary
  isDragging: boolean
  onDelete: (id: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
}) {
  const navigate = useNavigate()
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, cookbook.id)}
      onDragOver={(e) => onDragOver(e, cookbook.id)}
      onDragEnd={onDragEnd}
      onClick={() => navigate(`/cookbooks/${cookbook.id}`)}
      onMouseEnter={(e) => {
        if (isDragging) return
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = 'var(--shadow-md)'
        el.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = 'none'
        el.style.transform = 'translateY(0)'
      }}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: isDragging ? 'none' : 'box-shadow 0.15s, transform 0.15s, opacity 0.15s',
        opacity: isDragging ? 0.45 : 1,
        userSelect: 'none',
      }}
    >
      <CookbookCollage photos={cookbook.cover_photos ?? []} />

      <div style={{ padding: '14px 16px 16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{cookbook.title}</h3>
        {cookbook.description && (
          <p style={{
            fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '8px',
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {cookbook.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {cookbook.recipe_count} recipe{cookbook.recipe_count === 1 ? '' : 's'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(cookbook.id) }}
            style={{
              background: 'none', border: 'none', color: 'var(--color-text-muted)',
              cursor: 'pointer', fontSize: '13px', padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CookbooksPage() {
  const isMobile = useMobile()
  const { data: cookbooks, isLoading } = useCookbooks()
  const createMutation = useCreateCookbook()
  const deleteMutation = useDeleteCookbook()
  const reorderMutation = useReorderCookbooks()

  const { confirm, modal: confirmModal } = useConfirm()
  const [localCookbooks, setLocalCookbooks] = useState<CookbookSummary[]>([])
  const draggingId = useRef<string | null>(null)

  useEffect(() => {
    if (cookbooks && !draggingId.current) {
      setLocalCookbooks(cookbooks)
    }
  }, [cookbooks])

  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState('')

  function handleDragStart(e: React.DragEvent, id: string) {
    draggingId.current = id
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!draggingId.current || draggingId.current === overId) return
    setLocalCookbooks((prev) => {
      const fromIdx = prev.findIndex((c) => c.id === draggingId.current)
      const toIdx = prev.findIndex((c) => c.id === overId)
      if (fromIdx === -1 || toIdx === -1) return prev
      return reorder(prev, fromIdx, toIdx)
    })
  }

  function handleDragEnd() {
    draggingId.current = null
    reorderMutation.mutate(localCookbooks.map((c) => c.id))
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!title.trim()) { setFormError('Title is required.'); return }
    await createMutation.mutateAsync({ title: title.trim(), description: description.trim() || undefined })
    setTitle('')
    setDescription('')
    setShowCreate(false)
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: 'Delete Cookbook',
      message: 'Delete this cookbook? Recipes inside will not be deleted.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    await deleteMutation.mutateAsync(id)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '28px' }}>
        {isMobile
          ? <LibrarySelector active="cookbooks" />
          : (
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Cookbooks</h1>
              {localCookbooks.length > 1 && (
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  Drag to reorder
                </p>
              )}
            </div>
          )
        }
        <Button onClick={() => setShowCreate(true)} style={{ flexShrink: 0 }}>
          {isMobile ? '+ New' : '+ New Cookbook'}
        </Button>
      </div>

      {isLoading ? (
        <CookbookGridSkeleton />
      ) : !localCookbooks.length ? (
        <EmptyState
          icon="📖"
          title="No cookbooks yet"
          description="Create a cookbook to organize your recipes into collections."
          action={<Button onClick={() => setShowCreate(true)}>Create your first cookbook</Button>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
          {localCookbooks.map((cb) => (
            <CookbookCard
              key={cb.id}
              cookbook={cb}
              isDragging={draggingId.current === cb.id}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setFormError('') }} title="New Cookbook">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: '80px' }} />
          {formError && <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>{formError}</p>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button type="submit" loading={createMutation.isPending}>Create</Button>
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
      {confirmModal}
    </div>
  )
}

function CookbookGridSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden', background: 'var(--color-surface)' }}>
          <div style={{ height: '140px', background: 'var(--color-border)' }} />
          <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ height: '16px', width: '70%', background: 'var(--color-border)', borderRadius: '4px' }} />
            <div style={{ height: '12px', width: '90%', background: 'var(--color-border)', borderRadius: '4px' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
