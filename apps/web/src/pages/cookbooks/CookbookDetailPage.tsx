import { useState, useEffect, useRef, FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  useCookbook, useUpdateCookbook, useRemoveRecipeFromCookbook,
  useReorderCookbookRecipes,
} from '../../api/cookbooks'
import { RecipeCard } from '../../components/ui/RecipeCard'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { RecipeSummary } from '../../api/recipes'

function reorder<T>(list: T[], fromIdx: number, toIdx: number): T[] {
  const next = [...list]
  const [moved] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, moved)
  return next
}

export default function CookbookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: cookbook, isLoading } = useCookbook(id!)
  const updateMutation = useUpdateCookbook(id!)
  const removeRecipe = useRemoveRecipeFromCookbook()
  const reorderRecipes = useReorderCookbookRecipes(id!)

  const [localRecipes, setLocalRecipes] = useState<RecipeSummary[]>([])
  const draggingId = useRef<string | null>(null)

  useEffect(() => {
    if (cookbook?.recipes && !draggingId.current) {
      setLocalRecipes(cookbook.recipes)
    }
  }, [cookbook?.recipes])

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState('')

  function openEdit() {
    setTitle(cookbook?.title ?? '')
    setDescription(cookbook?.description ?? '')
    setFormError('')
    setEditing(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!title.trim()) { setFormError('Title is required.'); return }
    await updateMutation.mutateAsync({ title: title.trim(), description: description.trim() || undefined })
    setEditing(false)
  }

  async function handleRemove(recipeId: string) {
    if (!confirm('Remove this recipe from the cookbook?')) return
    await removeRecipe.mutateAsync({ cookbookId: id!, recipeId })
  }

  function handleDragStart(e: React.DragEvent, recipeId: string) {
    draggingId.current = recipeId
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!draggingId.current || draggingId.current === overId) return
    setLocalRecipes((prev) => {
      const fromIdx = prev.findIndex((r) => r.id === draggingId.current)
      const toIdx = prev.findIndex((r) => r.id === overId)
      if (fromIdx === -1 || toIdx === -1) return prev
      return reorder(prev, fromIdx, toIdx)
    })
  }

  function handleDragEnd() {
    draggingId.current = null
    reorderRecipes.mutate(localRecipes.map((r) => r.id))
  }

  if (isLoading) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading...</div>
  }
  if (!cookbook) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Cookbook not found.</div>
  }

  return (
    <div>
      <Link
        to="/cookbooks"
        style={{ fontSize: '13px', color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '20px' }}
      >
        ← All Cookbooks
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '8px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700 }}>{cookbook.title}</h1>
          {cookbook.description && (
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '6px', maxWidth: '560px', lineHeight: 1.6 }}>
              {cookbook.description}
            </p>
          )}
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            {localRecipes.length} recipe{localRecipes.length === 1 ? '' : 's'}
            {localRecipes.length > 1 && (
              <span style={{ marginLeft: '10px' }}>· Drag to reorder</span>
            )}
          </p>
        </div>
        <Button variant="secondary" onClick={openEdit}>Edit</Button>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '24px 0' }} />

      {localRecipes.length === 0 ? (
        <EmptyState
          icon="📖"
          title="No recipes in this cookbook yet"
          description="Open any recipe and use 'Add to Cookbook' to add it here."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
          {localRecipes.map((recipe) => (
            <div
              key={recipe.id}
              draggable
              onDragStart={(e) => handleDragStart(e, recipe.id)}
              onDragOver={(e) => handleDragOver(e, recipe.id)}
              onDragEnd={handleDragEnd}
              style={{
                position: 'relative',
                cursor: draggingId.current === recipe.id ? 'grabbing' : 'grab',
                opacity: draggingId.current === recipe.id ? 0.45 : 1,
                transition: draggingId.current ? 'none' : 'opacity 0.15s',
                userSelect: 'none',
              }}
            >
              <RecipeCard recipe={recipe} />
              <button
                onClick={() => handleRemove(recipe.id)}
                title="Remove from cookbook"
                style={{
                  position: 'absolute', top: '8px', right: '8px',
                  background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%',
                  width: '26px', height: '26px', color: '#fff', cursor: 'pointer',
                  fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit Cookbook">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: '80px' }} />
          {formError && <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>{formError}</p>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button type="submit" loading={updateMutation.isPending}>Save</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
