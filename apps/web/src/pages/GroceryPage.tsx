import { useGroceryList, useRemoveRecipeFromGrocery, useToggleGroceryItem, GroceryItem, GroceryRecipe } from '../api/grocery'
import { EmptyState } from '../components/ui/EmptyState'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'

function formatQty(quantity: number | string | null, unit: string | null): string {
  if (quantity === null || quantity === undefined) return ''
  const num = Number(quantity)
  if (isNaN(num)) return String(quantity)
  const qty = num === Math.round(num) ? String(Math.round(num)) : String(parseFloat(num.toFixed(2)))
  return unit ? `${qty} ${unit}` : qty
}

export default function GroceryPage() {
  const { data: list, isLoading } = useGroceryList()
  const removeRecipe = useRemoveRecipeFromGrocery()
  const toggleItem = useToggleGroceryItem()
  const navigate = useNavigate()

  if (isLoading) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading...</div>
  }

  const recipes: GroceryRecipe[] = list?.recipes ?? []
  const items: GroceryItem[] = list?.items ?? []
  const checked = items.filter((i) => i.is_checked)
  const unchecked = items.filter((i) => !i.is_checked)

  return (
    <div style={{ maxWidth: '640px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Grocery List</h1>
      <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '28px' }}>
        Items are merged across recipes. Tap to check off as you shop.
      </p>

      {/* Recipes contributing to list */}
      {recipes.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
            Recipes in list
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recipes.map((r: GroceryRecipe) => (
              <div key={r.recipe_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <button
                  onClick={() => navigate(`/recipes/${r.recipe_id}`)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: 'var(--color-text)', padding: 0, fontFamily: 'var(--font-sans)', textAlign: 'left' }}
                >
                  {r.title}
                  {r.servings && r.base_servings && r.servings !== r.base_servings && (
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                      ({r.servings} servings)
                    </span>
                  )}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`Remove "${r.title}" from your grocery list?`)) return
                    await removeRecipe.mutateAsync(r.recipe_id)
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '13px', padding: '2px 6px' }}
                >Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon="🛒"
          title="Your grocery list is empty"
          description="Open any recipe and tap 'Add to Grocery List' to start building your list."
          action={<Button onClick={() => navigate('/recipes')}>Browse Recipes</Button>}
        />
      ) : (
        <>
          {/* Unchecked items */}
          {unchecked.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
                To buy — {unchecked.length} item{unchecked.length === 1 ? '' : 's'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {unchecked.map((item: GroceryItem) => (
                  <GroceryItemRow key={item.id} item={item} onToggle={(id, val) => toggleItem.mutate({ id, is_checked: val })} />
                ))}
              </div>
            </div>
          )}

          {/* Checked items */}
          {checked.length > 0 && (
            <div>
              <p style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
                In cart — {checked.length}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {checked.map((item: GroceryItem) => (
                  <GroceryItemRow key={item.id} item={item} onToggle={(id, val) => toggleItem.mutate({ id, is_checked: val })} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function GroceryItemRow({ item, onToggle }: { item: GroceryItem; onToggle: (id: string, val: boolean) => void }) {
  const qtyLabel = formatQty(item.quantity, item.unit)
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', userSelect: 'none' }}>
      <input
        type="checkbox"
        checked={item.is_checked}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)', flexShrink: 0 }}
      />
      <span style={{ flex: 1, fontSize: '14px', color: item.is_checked ? 'var(--color-text-muted)' : 'var(--color-text)', textDecoration: item.is_checked ? 'line-through' : 'none' }}>
        {qtyLabel && <span style={{ fontWeight: 600, marginRight: '6px' }}>{qtyLabel}</span>}
        {item.display_name}
      </span>
      {item.notes && (
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.notes}</span>
      )}
    </label>
  )
}
