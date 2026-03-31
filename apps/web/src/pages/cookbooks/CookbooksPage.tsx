import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCookbooks, useCreateCookbook, useDeleteCookbook, CookbookSummary } from '../../api/cookbooks'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'

function CookbookCard({ cookbook, onDelete }: { cookbook: CookbookSummary; onDelete: (id: string) => void }) {
  const navigate = useNavigate()
  return (
    <div
      style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden', cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onClick={() => navigate(`/cookbooks/${cookbook.id}`)}
      onMouseEnter={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'var(--shadow-md)'; el.style.transform = 'translateY(-2px)' }}
      onMouseLeave={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'none'; el.style.transform = 'translateY(0)' }}
    >
      {/* Cover / placeholder */}
      {cookbook.cover_url ? (
        <img src={cookbook.cover_url} alt={cookbook.title} style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{
          height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', fontSize: '48px',
        }}>📖</div>
      )}
      <div style={{ padding: '14px 16px 16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{cookbook.title}</h3>
        {cookbook.description && (
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '8px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {cookbook.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {cookbook.recipe_count} recipe{cookbook.recipe_count === 1 ? '' : 's'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(cookbook.id) }}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '13px', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}
          >Delete</button>
        </div>
      </div>
    </div>
  )
}

export default function CookbooksPage() {
  const { data: cookbooks, isLoading } = useCookbooks()
  const createMutation = useCreateCookbook()
  const deleteMutation = useDeleteCookbook()

  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState('')

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
    if (!confirm('Delete this cookbook? Recipes inside will not be deleted.')) return
    await deleteMutation.mutateAsync(id)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Cookbooks</h1>
        <Button onClick={() => setShowCreate(true)}>+ New Cookbook</Button>
      </div>

      {isLoading ? (
        <CookbookGridSkeleton />
      ) : !cookbooks?.length ? (
        <EmptyState
          icon="📖"
          title="No cookbooks yet"
          description="Create a cookbook to organize your recipes into collections."
          action={<Button onClick={() => setShowCreate(true)}>Create your first cookbook</Button>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
          {cookbooks.map((cb: CookbookSummary) => (
            <CookbookCard key={cb.id} cookbook={cb} onDelete={handleDelete} />
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
