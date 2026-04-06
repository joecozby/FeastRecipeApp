import { useState, useRef, useLayoutEffect } from 'react'
import { useMobile } from '../../hooks/useMobile'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useRecipe, usePublishRecipe, useDeleteRecipe, useRecipeNutrition, useSaveRecipe, useUnsaveRecipe, RecipeIngredient, Instruction, Tag } from '../../api/recipes'
import { useCookbooks, useAddRecipeToCookbook } from '../../api/cookbooks'
import { useAddRecipeToGrocery } from '../../api/grocery'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useConfirm } from '../../components/ui/ConfirmModal'
import { useAuthStore } from '../../store/authStore'

function formatQty(n: number): string {
  if (n === Math.round(n)) return String(Math.round(n))
  return String(parseFloat(n.toFixed(1)))
}

const UNIT_UNCHANGED = new Set([
  'tbsp', 'tsp', 'oz', 'lb', 'lbs', 'g', 'kg', 'ml', 'l', 'cl', 'dl',
  'fl oz', 'each', 'doz', 'dozen',
])
const UNIT_IRREGULAR: Record<string, string> = { leaf: 'leaves', loaf: 'loaves', half: 'halves' }

function pluralizeUnit(unit: string, quantity: number): string {
  if (quantity === 1) return unit
  const u = unit.toLowerCase().trim()
  if (UNIT_UNCHANGED.has(u)) return unit
  if (u.endsWith('s')) return unit
  if (UNIT_IRREGULAR[u]) return UNIT_IRREGULAR[u]
  if (/(?:ch|sh|[xz])$/.test(u)) return unit + 'es'
  return unit + 's'
}

function scaleQty(qty: number | null, scale: number): string {
  if (qty === null) return ''
  const scaled = qty * scale
  if (scaled === Math.round(scaled)) return String(Math.round(scaled))
  return String(parseFloat(scaled.toFixed(2)))
}

// Returns converted {quantity, unit} or null if unit is unrecognised / already in target system
function convertUnit(
  quantity: number | null,
  unit: string | null,
  target: 'metric' | 'us',
): { quantity: string; unit: string } | null {
  if (!quantity || !unit) return null
  const u = unit.toLowerCase().trim()

  if (target === 'metric') {
    const vol: Record<string, number> = {
      teaspoon: 5, tsp: 5,
      tablespoon: 15, tbsp: 15,
      cup: 240, cups: 240,
      'fluid ounce': 29.57, 'fl oz': 29.57,
    }
    const wt: Record<string, number> = {
      ounce: 28.35, oz: 28.35,
      pound: 453.6, lb: 453.6, lbs: 453.6,
    }
    if (vol[u] !== undefined) {
      const ml = quantity * vol[u]
      return ml >= 1000 ? { quantity: formatQty(ml / 1000), unit: 'L' } : { quantity: formatQty(ml), unit: 'ml' }
    }
    if (wt[u] !== undefined) {
      const g = quantity * wt[u]
      return g >= 1000 ? { quantity: formatQty(g / 1000), unit: 'kg' } : { quantity: formatQty(g), unit: 'g' }
    }
    return null
  }

  // target === 'us'
  if (u === 'ml') {
    if (quantity < 15) return { quantity: formatQty(quantity / 5), unit: 'tsp' }
    if (quantity < 60) return { quantity: formatQty(quantity / 15), unit: 'tbsp' }
    return { quantity: formatQty(quantity / 240), unit: 'cup' }
  }
  if (u === 'l' || u === 'liter' || u === 'litre') {
    return { quantity: formatQty((quantity * 1000) / 240), unit: 'cup' }
  }
  if (u === 'g' || u === 'gram' || u === 'grams') {
    return quantity < 454 ? { quantity: formatQty(quantity / 28.35), unit: 'oz' } : { quantity: formatQty(quantity / 453.6), unit: 'lb' }
  }
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') {
    return { quantity: formatQty(quantity * 2.205), unit: 'lb' }
  }
  return null
}

function groupBy<T>(items: T[], key: (item: T) => string | null): [string | null, T[]][] {
  const map = new Map<string | null, T[]>()
  for (const item of items) {
    const k = key(item)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return Array.from(map.entries())
}

const DIFFICULTY_STYLE: Record<string, { bg: string; color: string }> = {
  easy:   { bg: 'var(--color-easy-bg)',   color: 'var(--color-easy)'   },
  medium: { bg: 'var(--color-medium-bg)', color: 'var(--color-medium)' },
  hard:   { bg: 'var(--color-hard-bg)',   color: 'var(--color-hard)'   },
}

function formatTime(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

// Number circle = 28px tall. To pin the number at the same Y as 2-line centering:
//   2-line center from top = 1 × lineHeight
//   marginTop for number  = lineHeight − (28 / 2) = lineHeight − 14
const NUMBER_H = 28

function InstructionStep({ step }: { step: Instruction }) {
  const textRef = useRef<HTMLParagraphElement>(null)
  const [isLong, setIsLong] = useState(false)
  const [numMargin, setNumMargin] = useState(0)

  useLayoutEffect(() => {
    const el = textRef.current
    if (!el) return
    const lh = parseFloat(window.getComputedStyle(el).lineHeight)
    if (!isNaN(lh) && lh > 0) {
      const lines = Math.round(el.getBoundingClientRect().height / lh)
      setIsLong(lines >= 3)
      setNumMargin(Math.max(0, lh - NUMBER_H / 2))
    }
  }, [step.body])

  return (
    <li style={{ display: 'flex', gap: '16px', alignItems: isLong ? 'flex-start' : 'center' }}>
      <span style={{
        width: `${NUMBER_H}px`, height: `${NUMBER_H}px`, borderRadius: '50%',
        background: 'var(--color-primary)', color: '#fff',
        fontSize: '13px', fontWeight: 700, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: isLong ? `${numMargin}px` : '0',
      }}>{step.step_number}</span>
      <p ref={textRef} style={{ fontSize: '14px', lineHeight: 1.65, margin: 0 }}>{step.body}</p>
    </li>
  )
}

export default function RecipeDetailPage() {
  const isMobile = useMobile()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const { data: recipe, isLoading } = useRecipe(id!)
  const { data: nutrition } = useRecipeNutrition(id!)
  const publishMutation = usePublishRecipe(id!)
  const deleteMutation = useDeleteRecipe()
  const saveMutation = useSaveRecipe()
  const unsaveMutation = useUnsaveRecipe()
  const addToGrocery = useAddRecipeToGrocery()
  const addToCookbook = useAddRecipeToCookbook()
  const { data: cookbooks } = useCookbooks()

  const { confirm, modal: confirmModal } = useConfirm()
  const [servings, setServings] = useState<number | null>(null)
  const [unitSystem, setUnitSystem] = useState<'original' | 'metric' | 'us'>('original')
  const [mobileTab, setMobileTab] = useState<'ingredients' | 'instructions'>('ingredients')
  const [cookbookModal, setCookbookModal] = useState(false)
  const [groceryMsg, setGroceryMsg] = useState('')

  const isOwner = recipe ? (recipe.is_owner ?? recipe.owner_id === currentUser?.id) : false

  if (isLoading) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading...</div>
  }
  if (!recipe) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Recipe not found.</div>
  }

  const base = Math.round(recipe.base_servings ?? 1)
  const currentServings = servings ?? base
  const scale = base > 0 ? currentServings / base : 1
  const totalMins = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0)

  const ingredientGroups = groupBy(recipe.ingredients ?? [], (i: RecipeIngredient) => i.group_label)
  const instructionGroups = groupBy(recipe.instructions ?? [], (i: Instruction) => i.group_label)

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete Recipe',
      message: 'Delete this recipe? This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    await deleteMutation.mutateAsync(id!)
    navigate('/recipes')
  }

  async function handleAddToGrocery() {
    await addToGrocery.mutateAsync({ recipe_id: id!, servings: currentServings })
    setGroceryMsg('Added to grocery list!')
    setTimeout(() => setGroceryMsg(''), 3000)
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <Link
        to="/recipes"
        style={{ fontSize: '13px', color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '20px' }}
      >
        ← {isOwner ? 'All Recipes' : 'Back'}
      </Link>

      {recipe.cover_url ? (
        <img
          src={recipe.cover_url}
          alt={recipe.title}
          style={{ width: '100%', height: '320px', objectFit: 'cover', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'block' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '220px', borderRadius: 'var(--radius-xl)', marginBottom: '24px',
          background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src="/logo.svg" alt="" style={{ height: '100px', opacity: 0.9 }} />
        </div>
      )}

      {/* Title + management actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '12px' }}>
        <div>
          {recipe.status === 'draft' && isOwner && (
            <span style={{ fontSize: '11px', fontWeight: 600, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '999px', marginBottom: '8px', display: 'inline-block' }}>
              PRIVATE
            </span>
          )}
          <h1 style={{ fontSize: '30px', fontWeight: 700, lineHeight: 1.2, fontFamily: 'var(--font-display)' }}>{recipe.title}</h1>
          {recipe.owner_name && !isOwner && (
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>by {recipe.owner_name}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          {isOwner ? (
            <>
              <Button variant="secondary" onClick={() => navigate(`/recipes/${id}/edit`)}>Edit</Button>
              <Button
                variant={recipe.status === 'published' ? 'ghost' : 'primary'}
                loading={publishMutation.isPending}
                onClick={() => publishMutation.mutate()}
              >
                {recipe.status === 'published' ? 'Make Private' : 'Make Public'}
              </Button>
            </>
          ) : (
            <Button
              variant={recipe.is_saved ? 'ghost' : 'primary'}
              loading={saveMutation.isPending || unsaveMutation.isPending}
              onClick={() => {
                if (recipe.is_saved) unsaveMutation.mutate(id!)
                else saveMutation.mutate(id!)
              }}
            >
              {recipe.is_saved ? '🔖 Saved' : '🔖 Save Recipe'}
            </Button>
          )}
        </div>
      </div>

      {/* Quick actions — visible without scrolling */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        <Button onClick={handleAddToGrocery} loading={addToGrocery.isPending} variant="secondary">
          🛒 Add to Grocery List
        </Button>
        <Button variant="secondary" onClick={() => setCookbookModal(true)}>
          📖 Add to Cookbook
        </Button>
        {groceryMsg && (
          <span style={{ fontSize: '13px', color: '#16a34a', fontFamily: 'var(--font-sans)' }}>
            {groceryMsg}
          </span>
        )}
      </div>

      {/* Meta — on mobile: cuisine+difficulty on row 1, times on row 2 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {/* Row 1: cuisine + difficulty */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {recipe.cuisine && (
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>🌍 {recipe.cuisine}</span>
          )}
          {recipe.difficulty && DIFFICULTY_STYLE[recipe.difficulty] && (
            <span style={{
              fontSize: '12px', fontWeight: 700,
              color: DIFFICULTY_STYLE[recipe.difficulty].color,
              background: DIFFICULTY_STYLE[recipe.difficulty].bg,
              padding: '3px 10px', borderRadius: 'var(--radius-full)',
              fontFamily: 'var(--font-sans)',
            }}>
              {recipe.difficulty.charAt(0).toUpperCase() + recipe.difficulty.slice(1)}
            </span>
          )}
          {/* On desktop keep times in the same row */}
          {!isMobile && recipe.prep_time_mins ? (
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>⏱ Prep {formatTime(recipe.prep_time_mins)}</span>
          ) : null}
          {!isMobile && recipe.cook_time_mins ? (
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>🔥 Cook {formatTime(recipe.cook_time_mins)}</span>
          ) : null}
          {!isMobile && totalMins > 0 && recipe.prep_time_mins && recipe.cook_time_mins ? (
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Total {formatTime(totalMins)}</span>
          ) : null}
        </div>
        {/* Row 2 (mobile only): times */}
        {isMobile && (recipe.prep_time_mins || recipe.cook_time_mins) && (
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            {recipe.prep_time_mins ? (
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>⏱ Prep {formatTime(recipe.prep_time_mins)}</span>
            ) : null}
            {recipe.cook_time_mins ? (
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>🔥 Cook {formatTime(recipe.cook_time_mins)}</span>
            ) : null}
            {totalMins > 0 && recipe.prep_time_mins && recipe.cook_time_mins ? (
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Total {formatTime(totalMins)}</span>
            ) : null}
          </div>
        )}
      </div>

      {/* Tags */}
      {recipe.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {recipe.tags.map((tag: Tag) => (
            <span key={tag.id} style={{ fontSize: '12px', background: 'var(--color-border)', color: 'var(--color-text-muted)', padding: '3px 10px', borderRadius: '999px' }}>
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {recipe.description && (
        <p style={{ fontSize: '15px', color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '28px' }}>
          {recipe.description}
        </p>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', marginBottom: '28px' }} />

      {/* Serving scaler */}
      {recipe.base_servings ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Servings</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setServings(Math.max(1, Math.round(currentServings) - 1))}
              style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)' }}
            >−</button>
            <span style={{ fontSize: '16px', fontWeight: 600, minWidth: '24px', textAlign: 'center' }}>{currentServings}</span>
            <button
              onClick={() => setServings(Math.round(currentServings) + 1)}
              style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)' }}
            >+</button>
          </div>
          {currentServings !== base && (
            <button onClick={() => setServings(null)} style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Reset
            </button>
          )}
        </div>
      ) : null}

      {/* Mobile tab toggle — Ingredients / Instructions */}
      {isMobile && (
        <div style={{ display: 'flex', background: 'var(--color-silver)', borderRadius: 'var(--radius-sm)', padding: '3px', gap: '2px', marginBottom: '20px', width: 'fit-content' }}>
          {(['ingredients', 'instructions'] as const).map((tab) => (
            <button key={tab} onClick={() => setMobileTab(tab)} style={{
              padding: '6px 18px', borderRadius: 'calc(var(--radius-sm) - 2px)', border: 'none',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              background: mobileTab === tab ? 'var(--color-primary)' : 'transparent',
              color: mobileTab === tab ? '#fff' : 'var(--color-text-muted)',
              boxShadow: mobileTab === tab ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s var(--ease-out)',
            }}>
              {tab === 'ingredients' ? 'Ingredients' : 'Instructions'}
            </button>
          ))}
        </div>
      )}

      {/* Ingredients + Instructions — side by side on desktop, tabbed on mobile */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '240px 1fr',
        gap: isMobile ? '32px' : '40px',
        alignItems: 'start',
      }}>
        <div style={{ display: isMobile && mobileTab !== 'ingredients' ? 'none' : undefined }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Ingredients</h2>
            <div style={{ display: 'flex', background: 'var(--color-silver)', borderRadius: 'var(--radius-sm)', padding: '3px', gap: '2px', width: 'fit-content' }}>
              {(['original', 'metric', 'us'] as const).map((sys) => (
                <button key={sys} onClick={() => setUnitSystem(sys)} style={{
                  padding: '4px 12px', borderRadius: 'calc(var(--radius-sm) - 2px)', border: 'none',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  background: unitSystem === sys ? 'var(--color-primary)' : 'transparent',
                  color: unitSystem === sys ? '#fff' : 'var(--color-text-muted)',
                  boxShadow: unitSystem === sys ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.15s var(--ease-out)',
                }}>
                  {sys === 'original' ? 'Original' : sys === 'metric' ? 'Metric' : 'US'}
                </button>
              ))}
            </div>
          </div>
          {ingredientGroups.map(([group, items]) => (
            <div key={group ?? '_'} style={{ marginBottom: '20px' }}>
              {group && (
                <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                  {group}
                </p>
              )}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {items.map((ing: RecipeIngredient) => {
                  const scaledQty = ing.quantity !== null ? ing.quantity * scale : null
                  const converted = unitSystem !== 'original' ? convertUnit(scaledQty, ing.unit, unitSystem) : null
                  const qtyStr  = converted ? converted.quantity : scaleQty(ing.quantity, scale)
                  const rawUnit = converted ? converted.unit : ing.unit
                  const scaledQtyNum = converted
                    ? parseFloat(converted.quantity) || 1
                    : (ing.quantity ?? 1) * scale
                  const unitStr = rawUnit ? pluralizeUnit(rawUnit, scaledQtyNum) : rawUnit
                  const parts = [qtyStr, unitStr, ing.canonical_name ?? ing.raw_text, ing.preparation].filter(Boolean)
                  return (
                    <li key={ing.id} style={{ fontSize: '14px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--color-primary)', marginTop: '2px', flexShrink: 0 }}>•</span>
                      <span style={{ color: ing.is_optional ? 'var(--color-text-muted)' : 'var(--color-text)' }}>
                        {parts.join(' ')}{ing.is_optional ? ' (optional)' : ''}
                        {ing.notes && (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}> — {ing.notes}</span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ display: isMobile && mobileTab !== 'instructions' ? 'none' : undefined }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Instructions</h2>
          {instructionGroups.map(([group, steps]) => (
            <div key={group ?? '_'} style={{ marginBottom: '24px' }}>
              {group && (
                <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                  {group}
                </p>
              )}
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {steps.map((step: Instruction) => (
                  <InstructionStep key={step.id} step={step} />
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '32px 0' }} />

      {/* Nutrition panel */}
      {nutrition && (
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Nutrition per serving</h2>
            {nutrition.is_estimated && (
              <span style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
                ESTIMATED
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: '10px' }}>
            {([
              { label: 'Calories', value: nutrition.per_serving.calories, unit: 'kcal' },
              { label: 'Protein',  value: nutrition.per_serving.protein,  unit: 'g' },
              { label: 'Fat',      value: nutrition.per_serving.fat,      unit: 'g' },
              { label: 'Carbs',    value: nutrition.per_serving.carbs,    unit: 'g' },
              { label: 'Fiber',    value: nutrition.per_serving.fiber,    unit: 'g' },
              { label: 'Sodium',   value: nutrition.per_serving.sodium,   unit: 'mg' },
            ] as const).map(({ label, value, unit }) => (
              <div key={label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-primary)' }}>
                  {value}<span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)', marginLeft: '2px' }}>{unit}</span>
                </p>
                <p style={{ fontSize: '11px', fontWeight: 500, marginTop: '2px' }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom actions — owner only */}
      {isOwner && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="danger" loading={deleteMutation.isPending} onClick={handleDelete}>
            Delete Recipe
          </Button>
        </div>
      )}

      {recipe.source_url && (
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '24px' }}>
          Source:{' '}
          <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
            {recipe.source_url}
          </a>
        </p>
      )}

      {/* Add to Cookbook modal */}
      <Modal open={cookbookModal} onClose={() => setCookbookModal(false)} title="Add to Cookbook">
        {!cookbooks?.length ? (
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>No cookbooks yet. Create one first.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cookbooks.map((cb: { id: string; title: string }) => (
              <button
                key={cb.id}
                onClick={async () => {
                  await addToCookbook.mutateAsync({ cookbookId: cb.id, recipeId: id! })
                  setCookbookModal(false)
                }}
                style={{
                  padding: '12px 16px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                  textAlign: 'left', cursor: 'pointer', fontSize: '14px',
                  fontFamily: 'var(--font-sans)', color: 'var(--color-text)',
                }}
              >
                {cb.title}
              </button>
            ))}
          </div>
        )}
      </Modal>
      {confirmModal}
    </div>
  )
}
