import { useState, FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useCookbook, useUpdateCookbook, useRemoveRecipeFromCookbook } from '../../api/cookbooks'
import { RecipeCard } from '../../components/ui/RecipeCard'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { RecipeSummary } from '../../api/recipes'

export default function CookbookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: cookbook, isLoading } = useCookbook(id!)
  const updateMutation = useUpdateCookbook(id!)
  const removeRecipe = useRemoveRecipeFromCookbook()

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

  if (isLoading) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading...</div>
  }
  if (!cookbook) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Cookbook not found.</div>
  }

  const recipes: RecipeSummary[] = cookbook.recipes ?? []

  return (
    <div>
      <Link
        to="/cookbooks"
        style={{ fontSize: '13px', color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '20px' }}
      >
        ← All Cookbooks
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '8px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700 }}>{cookbook.title}</h1>
          {cookbook.description && (
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '6px', maxWidth: '560px', lineHeight: 1.6 }}>
              {cookbook.description}
            </p>
          )}
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            {recipes.length} recipe{recipes.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button variant="secondary" onClick={openEdit}>Edit</Button>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '24px 0' }} />

      {recipes.length === 0 ? (
        <EmptyState
          icon="📖"
          title="No recipes in this cookbook yet"
          description="Open any recipe and use 'Add to Cookbook' to add it here."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
          {recipes.map((recipe) => (
            <div key={recipe.id} style={{ position: 'relative' }}>
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

      {/* Edit modal */}
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
