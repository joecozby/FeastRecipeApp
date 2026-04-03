import { useState } from 'react'
import {
  useGroceryList,
  useRemoveRecipeFromGrocery,
  useToggleGroceryItem,
  useToggleIngredientGroup,
  GroceryItem,
  GroceryRecipe,
} from '../api/grocery'
import { useMySpiceCabinet, useAddToSpiceCabinet } from '../api/spiceCabinet'
import { EmptyState } from '../components/ui/EmptyState'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useConfirm } from '../components/ui/ConfirmModal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'combined' | 'by-recipe' | 'by-category'

// A logical ingredient entry shown to the user (may represent N raw rows)
interface MergedEntry {
  ingredient_key: string
  display_name: string
  quantity: number | null
  unit: string | null
  is_checked: boolean   // true when ALL source rows are checked
  item_ids: string[]    // ids of every raw item in this group (for bulk toggle)
  recipe_count: number  // how many recipes contribute
  in_spice_cabinet: boolean
  spice_cabinet_master_id: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Units that are abbreviations or mass nouns — never pluralize
const UNIT_UNCHANGED = new Set([
  'tbsp', 'tsp', 'oz', 'lb', 'lbs', 'g', 'kg', 'ml', 'l', 'cl', 'dl',
  'fl oz', 'each', 'doz', 'dozen',
])

// Irregular singular → plural mappings
const UNIT_IRREGULAR: Record<string, string> = {
  leaf: 'leaves',
  loaf: 'loaves',
  half: 'halves',
}

function pluralizeUnit(unit: string, quantity: number): string {
  if (quantity === 1) return unit
  const u = unit.toLowerCase().trim()
  if (UNIT_UNCHANGED.has(u)) return unit
  if (u.endsWith('s')) return unit               // already plural / mass noun
  if (UNIT_IRREGULAR[u]) return UNIT_IRREGULAR[u]
  if (/(?:ch|sh|[xz])$/.test(u)) return unit + 'es'  // pinch→pinches, dash→dashes, box→boxes
  return unit + 's'                              // tablespoon→tablespoons, cup→cups, etc.
}

function formatQty(quantity: number | null, unit: string | null): string {
  if (quantity === null || quantity === undefined) return unit ?? ''
  const num = Number(quantity)
  if (isNaN(num)) return unit ?? ''
  const qty = num === Math.round(num) ? String(Math.round(num)) : String(parseFloat(num.toFixed(2)))
  const displayUnit = unit ? pluralizeUnit(unit, num) : null
  return displayUnit ? `${qty} ${displayUnit}` : qty
}

// Merge an array of raw GroceryItems (same ingredient_key) into one display entry
function mergeItems(items: GroceryItem[]): MergedEntry {
  let totalQty: number | null = 0
  for (const item of items) {
    if (item.quantity === null || totalQty === null) {
      totalQty = null
    } else {
      totalQty += item.quantity
    }
  }
  return {
    ingredient_key: items[0].ingredient_key,
    display_name: items[0].display_name,
    quantity: totalQty !== null ? Math.round(totalQty * 100) / 100 : null,
    unit: items[0].unit,
    is_checked: items.every((i) => i.is_checked),
    item_ids: items.map((i) => i.id),
    recipe_count: items.length,
    in_spice_cabinet: items[0].in_spice_cabinet ?? false,
    spice_cabinet_master_id: items[0].spice_cabinet_master_id ?? null,
  }
}

// Build combined list (one entry per ingredient across all recipes)
function buildCombined(items: GroceryItem[]): MergedEntry[] {
  const map = new Map<string, GroceryItem[]>()
  for (const item of items) {
    const key = item.ingredient_key
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return Array.from(map.values()).map(mergeItems)
}

// Group items by recipe_id
function buildByRecipe(
  items: GroceryItem[],
  recipes: GroceryRecipe[]
): { recipe: GroceryRecipe; items: GroceryItem[] }[] {
  const recipeMap = new Map(recipes.map((r) => [r.recipe_id, r]))
  const grouped = new Map<string, GroceryItem[]>()
  for (const item of items) {
    const rid = item.recipe_id ?? '__unknown__'
    if (!grouped.has(rid)) grouped.set(rid, [])
    grouped.get(rid)!.push(item)
  }
  return Array.from(grouped.entries())
    .filter(([rid]) => recipeMap.has(rid))
    .map(([rid, items]) => ({ recipe: recipeMap.get(rid)!, items }))
}

// Derive a grocery-aisle category from an ingredient name.
// Rules:
//  - Trailing \b is intentionally omitted so plurals match (tomatoes, eggs, peppers…)
//  - Fresh produce items that also appear as dried spices (garlic, onion, ginger)
//    are sent to Produce unless the name signals a processed form.
function categorize(name: string): string {
  const n = name.toLowerCase()

  // Dairy & Eggs — check eggs? to match "egg" and "eggs"
  if (/\b(milk|cream|butter|cheese|eggs?|yogurt|sour cream|half.and.half|whipping|mozzarella|cheddar|parmesan|ricotta|brie|feta)/.test(n))
    return 'Dairy & Eggs'

  // Meat & Seafood
  if (/\b(chicken|beef|pork|lamb|turkey|veal|duck|bacon|sausage|ham|shrimp|salmon|tuna|cod|tilapia|crab|lobster|scallop|anchov|prosciutto|pancetta|steak|fillet|tenderloin)/.test(n))
    return 'Meat & Seafood'

  // Produce — skip if the name signals a dried / processed form so that
  // "garlic powder" or "dried basil" doesn't land here.
  const isProcessed = /\b(powder|dried|ground|flakes?|extract|paste|sauce|oil|syrup|pickled|canned|frozen)/.test(n)
  if (!isProcessed && /\b(apple|banana|berr|strawberr|blueberr|raspberr|lemon|lime|orange|grape|mango|peach|pear|plum|cherr|pineapple|watermelon|melon|avocado|tomato|lettuce|spinach|kale|arugula|carrot|celery|cucumber|bell pepper|jalape|poblano|anaheim|zucchini|squash|potato|broccoli|cauliflower|asparagus|corn|peas?|green bean|snap pea|eggplant|artichoke|beet|radish|leek|shallot|scallion|green onion|onion|garlic|ginger|cabbage|brussels sprout|bok choy|chard|collard|endive|fennel|turnip|parsnip|rutabaga|jicama|yam|taro|plantain|mushroom|cilantro|parsley|basil|mint|dill|chive|sage|rosemary|thyme|oregano|tarragon|bay leaf|fruit|vegetable|produce|fresh)/.test(n))
    return 'Produce'

  // Grains & Bread
  if (/\b(bread|tortilla|pasta|rice|noodle|spaghetti|fettuccine|penne|linguine|ramen|udon|soba|couscous|quinoa|farro|barley|oat|cereal|cracker|chip|pita|roll|bun|baguette|sourdough|bagel|croissant|flour|cornmeal|polenta)/.test(n))
    return 'Grains & Bread'

  // Herbs & Spices (also catches dried forms of produce herbs/veg)
  if (/\b(garlic|onion|ginger|cumin|paprika|turmeric|cinnamon|cayenne|chili|pepper|salt|coriander|cardamom|clove|nutmeg|allspice|star anise|fennel seed|mustard seed|caraway|saffron|sumac|za.atar|herbes de provence|italian seasoning|old bay|cajun|curry|garam masala|five spice|seasoning|spice|herb|basil|oregano|thyme|rosemary|sage|dill|tarragon|parsley|cilantro|mint|chive|bay leaf|vanilla)/.test(n))
    return 'Herbs & Spices'

  // Pantry
  if (/\b(oil|vinegar|balsamic|soy sauce|fish sauce|oyster sauce|hoisin|worcestershire|hot sauce|sriracha|ketchup|mustard|mayo|mayonnaise|ranch|tahini|miso|tomato paste|tomato sauce|canned|beans?|lentil|chickpea|black bean|kidney bean|pinto|flour|sugar|brown sugar|honey|maple syrup|molasses|jam|peanut butter|almond butter|cocoa|chocolate|baking powder|baking soda|yeast|cornstarch|broth|stock|bouillon|cream of tartar|breadcrumb|panko)/.test(n))
    return 'Pantry'

  // Frozen
  if (/\b(frozen|ice cream|gelato|sorbet)/.test(n))
    return 'Frozen'

  // Beverages
  if (/\b(water|juice|wine|beer|spirits|vodka|rum|whiskey|gin|tequila|coffee|tea|soda|sparkling|almond milk|oat milk|soy milk|beverage|drink)/.test(n))
    return 'Beverages'

  return 'Other'
}

// Build combined-within-category list grouped by aisle
function buildByCategory(items: GroceryItem[]): { category: string; entries: MergedEntry[] }[] {
  // First combine items by ingredient_key (same as combined view)
  const combined = buildCombined(items)
  // Then group those by category
  const catMap = new Map<string, MergedEntry[]>()
  for (const entry of combined) {
    const cat = categorize(entry.display_name)
    if (!catMap.has(cat)) catMap.set(cat, [])
    catMap.get(cat)!.push(entry)
  }

  // Sort categories in a sensible aisle order
  const order = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Grains & Bread', 'Herbs & Spices', 'Pantry', 'Frozen', 'Beverages', 'Other']
  return Array.from(catMap.entries())
    .sort(([a], [b]) => {
      const ai = order.indexOf(a)
      const bi = order.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    .map(([category, entries]) => ({ category, entries }))
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const options: { value: ViewMode; label: string }[] = [
    { value: 'combined', label: 'Combined' },
    { value: 'by-recipe', label: 'By Recipe' },
    { value: 'by-category', label: 'By Category' },
  ]
  return (
    <div style={{
      display: 'inline-flex', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: '24px',
    }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '7px 16px', fontSize: '13px', fontWeight: 500,
            cursor: 'pointer', border: 'none', fontFamily: 'var(--font-sans)',
            background: value === opt.value ? 'var(--color-primary)' : 'var(--color-surface)',
            color: value === opt.value ? '#fff' : 'var(--color-text-muted)',
            borderRight: '1px solid var(--color-border)',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Item row components
// ---------------------------------------------------------------------------

// Combined / By-category row — one merged entry, bulk checkbox
function MergedItemRow({
  entry,
  onToggle,
}: {
  entry: MergedEntry
  onToggle: (key: string, val: boolean) => void
}) {
  const qtyLabel = formatQty(entry.quantity, entry.unit)
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '11px 14px', background: 'var(--color-surface)',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      cursor: 'pointer', userSelect: 'none',
    }}>
      <input
        type="checkbox"
        checked={entry.is_checked}
        onChange={(e) => onToggle(entry.ingredient_key, e.target.checked)}
        style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)', flexShrink: 0 }}
      />
      <span style={{
        flex: 1, fontSize: '14px',
        color: entry.is_checked ? 'var(--color-text-muted)' : 'var(--color-text)',
        textDecoration: entry.is_checked ? 'line-through' : 'none',
      }}>
        {qtyLabel && <><span style={{ fontWeight: 600 }}>{qtyLabel}</span>{' '}</>}
        {entry.display_name}
      </span>
      {entry.in_spice_cabinet && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '3px',
          fontSize: '11px', fontWeight: 500,
          color: 'rgba(232, 106, 51, 0.75)',
          background: 'rgba(232, 106, 51, 0.08)',
          border: '1px solid rgba(232, 106, 51, 0.2)',
          borderRadius: 'var(--radius-full)',
          padding: '2px 8px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          🧂 In cabinet
        </span>
      )}
      {!entry.in_spice_cabinet && entry.recipe_count > 1 && (
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          {entry.recipe_count} recipes
        </span>
      )}
    </label>
  )
}

// By-recipe row — single raw item, individual checkbox
function SingleItemRow({
  item,
  onToggle,
  ownedMasterIds,
  onAddToCabinet,
  dismissedSuggestions,
  onDismissSuggestion,
}: {
  item: GroceryItem
  onToggle: (id: string, val: boolean) => void
  ownedMasterIds: Set<number>
  onAddToCabinet: (masterId: number) => void
  dismissedSuggestions: Set<number>
  onDismissSuggestion: (masterId: number) => void
}) {
  const qtyLabel = formatQty(item.quantity, item.unit)

  // Show the "add to cabinet?" suggestion when:
  // - item is just checked
  // - has a matching master item
  // - not already in cabinet
  // - not dismissed
  const showSuggestion =
    item.is_checked &&
    item.spice_cabinet_master_id !== null &&
    !ownedMasterIds.has(item.spice_cabinet_master_id) &&
    !dismissedSuggestions.has(item.spice_cabinet_master_id!)

  return (
    <div>
      <label style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '11px 14px', background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: showSuggestion ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
        borderBottom: showSuggestion ? 'none' : '1px solid var(--color-border)',
        cursor: 'pointer', userSelect: 'none',
      }}>
        <input
          type="checkbox"
          checked={item.is_checked}
          onChange={(e) => onToggle(item.id, e.target.checked)}
          style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)', flexShrink: 0 }}
        />
        <span style={{
          flex: 1, fontSize: '14px',
          color: item.is_checked ? 'var(--color-text-muted)' : 'var(--color-text)',
          textDecoration: item.is_checked ? 'line-through' : 'none',
        }}>
          {qtyLabel && <span style={{ fontWeight: 600, marginRight: '6px' }}>{qtyLabel}</span>}
          {item.display_name}
        </span>
        {item.in_spice_cabinet && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '3px',
            fontSize: '11px', fontWeight: 500,
            color: 'rgba(232, 106, 51, 0.75)',
            background: 'rgba(232, 106, 51, 0.08)',
            border: '1px solid rgba(232, 106, 51, 0.2)',
            borderRadius: 'var(--radius-full)',
            padding: '2px 8px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            🧂 In cabinet
          </span>
        )}
        {!item.in_spice_cabinet && item.notes && (
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.notes}</span>
        )}
      </label>
      {showSuggestion && item.spice_cabinet_master_id !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 14px',
          background: 'rgba(232, 106, 51, 0.05)',
          border: '1px solid rgba(232, 106, 51, 0.2)',
          borderTop: 'none',
          borderRadius: '0 0 var(--radius-md) var(--radius-md)',
          fontSize: '12px', color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-sans)',
        }}>
          <span style={{ flex: 1 }}>
            Add <strong style={{ color: 'var(--color-text)' }}>{item.display_name}</strong> to your spice cabinet?
          </span>
          <button
            onClick={() => onAddToCabinet(item.spice_cabinet_master_id!)}
            style={{
              background: 'var(--color-primary)',
              border: 'none', borderRadius: 'var(--radius-sm)',
              color: '#fff', fontSize: '11px', fontWeight: 600,
              padding: '3px 9px', cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            + Add
          </button>
          <button
            onClick={() => onDismissSuggestion(item.spice_cabinet_master_id!)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--color-text-muted)', fontSize: '11px',
              padding: '3px 6px', cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <p style={{
      fontSize: '12px', fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.06em', color: 'var(--color-text-muted)',
      marginBottom: '8px', marginTop: '20px',
    }}>
      {label}
      {count > 0 && (
        <span style={{ marginLeft: '8px', fontWeight: 400 }}>
          — {count} item{count === 1 ? '' : 's'}
        </span>
      )}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GroceryPage() {
  const { data: list, isLoading } = useGroceryList()
  const removeRecipe = useRemoveRecipeFromGrocery()
  const toggleItem = useToggleGroceryItem()
  const toggleGroup = useToggleIngredientGroup()
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<ViewMode>('combined')
  const { confirm, modal: confirmModal } = useConfirm()
  const { data: myCabinet } = useMySpiceCabinet()
  const addToCabinet = useAddToSpiceCabinet()
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set())

  const ownedMasterIds = new Set(myCabinet?.owned ?? [])

  function handleAddToCabinet(masterId: number) {
    addToCabinet.mutate(masterId)
    setDismissedSuggestions((prev) => new Set([...prev, masterId]))
  }

  function handleDismissSuggestion(masterId: number) {
    setDismissedSuggestions((prev) => new Set([...prev, masterId]))
  }

  if (isLoading) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading...</div>
  }

  const recipes: GroceryRecipe[] = list?.recipes ?? []
  const items: GroceryItem[] = list?.items ?? []

  const isEmpty = items.length === 0

  // Subtitle text varies by view mode
  const subtitles: Record<ViewMode, string> = {
    combined: 'Quantities combined across all recipes. Tap to check off as you shop.',
    'by-recipe': 'Ingredients grouped by recipe. Useful for cooking one dish at a time.',
    'by-category': 'Ingredients grouped by grocery aisle. Great for efficient shopping.',
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '6px' }}>Grocery List</h1>
      <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
        {subtitles[viewMode]}
      </p>

      {/* Recipes in list — horizontal scrollable photo cards */}
      {recipes.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{
            fontSize: '12px', fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '10px',
          }}>
            Recipes in list
          </p>
          <div style={{
            display: 'flex', gap: '10px', overflowX: 'auto',
            paddingBottom: '4px',
            scrollbarWidth: 'none',
          }}>
            {recipes.map((r: GroceryRecipe) => (
              <div key={r.recipe_id} style={{
                flexShrink: 0, width: '120px', position: 'relative',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                overflow: 'hidden', background: 'var(--color-surface)',
              }}>
                {/* Cover photo */}
                <div
                  onClick={() => navigate(`/recipes/${r.recipe_id}`)}
                  style={{
                    width: '100%', height: '80px', cursor: 'pointer',
                    background: r.cover_image_url
                      ? `url(${r.cover_image_url}) center/cover no-repeat`
                      : 'var(--color-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {!r.cover_image_url && (
                    <span style={{ fontSize: '28px' }}>🍽️</span>
                  )}
                </div>
                {/* Text */}
                <div
                  onClick={() => navigate(`/recipes/${r.recipe_id}`)}
                  style={{ padding: '8px 8px 6px', cursor: 'pointer' }}
                >
                  <p style={{
                    fontSize: '12px', fontWeight: 600, lineHeight: 1.3,
                    color: 'var(--color-text)',
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    marginBottom: '4px',
                  }}>
                    {r.title}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 500 }}>
                    View recipe &rsaquo;
                  </p>
                </div>
                {/* Remove X */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    const ok = await confirm({
                      title: 'Remove from Grocery List',
                      message: `Remove "${r.title}" from your grocery list?`,
                      confirmLabel: 'Remove',
                      variant: 'danger',
                    })
                    if (!ok) return
                    await removeRecipe.mutateAsync(r.recipe_id)
                  }}
                  style={{
                    position: 'absolute', top: '5px', right: '5px',
                    width: '20px', height: '20px', borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)', border: 'none',
                    color: '#fff', fontSize: '12px', fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View mode toggle */}
      {!isEmpty && <ViewToggle value={viewMode} onChange={setViewMode} />}

      {/* Empty state */}
      {isEmpty ? (
        <EmptyState
          icon="🛒"
          title="Your grocery list is empty"
          description="Open any recipe and tap 'Add to Grocery List' to start building your list."
          action={<Button onClick={() => navigate('/recipes')}>Browse Recipes</Button>}
        />
      ) : (
        <>
          {viewMode === 'combined' && (
            <CombinedView
              items={items}
              onToggleGroup={(key, val) => toggleGroup.mutate({ ingredient_key: key, is_checked: val })}
            />
          )}
          {viewMode === 'by-recipe' && (
            <ByRecipeView
              items={items}
              recipes={recipes}
              onToggleItem={(id, val) => toggleItem.mutate({ id, is_checked: val })}
              ownedMasterIds={ownedMasterIds}
              onAddToCabinet={handleAddToCabinet}
              dismissedSuggestions={dismissedSuggestions}
              onDismissSuggestion={handleDismissSuggestion}
            />
          )}
          {viewMode === 'by-category' && (
            <ByCategoryView
              items={items}
              onToggleGroup={(key, val) => toggleGroup.mutate({ ingredient_key: key, is_checked: val })}
            />
          )}
        </>
      )}
      {confirmModal}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Combined view
// ---------------------------------------------------------------------------

function CombinedView({
  items,
  onToggleGroup,
}: {
  items: GroceryItem[]
  onToggleGroup: (key: string, val: boolean) => void
}) {
  const combined = buildCombined(items)
  const unchecked = combined.filter((e) => !e.is_checked)
  const checked = combined.filter((e) => e.is_checked)

  return (
    <>
      {unchecked.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <SectionHeader label="To buy" count={unchecked.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {unchecked.map((entry) => (
              <MergedItemRow key={entry.ingredient_key} entry={entry} onToggle={onToggleGroup} />
            ))}
          </div>
        </div>
      )}
      {checked.length > 0 && (
        <div>
          <SectionHeader label="In cart" count={checked.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {checked.map((entry) => (
              <MergedItemRow key={entry.ingredient_key} entry={entry} onToggle={onToggleGroup} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// By Recipe view
// ---------------------------------------------------------------------------

function ByRecipeView({
  items,
  recipes,
  onToggleItem,
  ownedMasterIds,
  onAddToCabinet,
  dismissedSuggestions,
  onDismissSuggestion,
}: {
  items: GroceryItem[]
  recipes: GroceryRecipe[]
  onToggleItem: (id: string, val: boolean) => void
  ownedMasterIds: Set<number>
  onAddToCabinet: (masterId: number) => void
  dismissedSuggestions: Set<number>
  onDismissSuggestion: (masterId: number) => void
}) {
  const groups = buildByRecipe(items, recipes)

  return (
    <>
      {groups.map(({ recipe, items: recipeItems }) => {
        const unchecked = recipeItems.filter((i) => !i.is_checked)
        const checked = recipeItems.filter((i) => i.is_checked)
        return (
          <div key={recipe.recipe_id} style={{ marginBottom: '28px' }}>
            {/* Recipe header */}
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: '8px',
              marginBottom: '8px', marginTop: '4px',
            }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' }}>
                {recipe.title}
              </p>
              {recipe.servings && recipe.base_servings && recipe.servings !== recipe.base_servings && (
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {recipe.servings} servings
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {unchecked.map((item) => (
                <SingleItemRow
                  key={item.id}
                  item={item}
                  onToggle={onToggleItem}
                  ownedMasterIds={ownedMasterIds}
                  onAddToCabinet={onAddToCabinet}
                  dismissedSuggestions={dismissedSuggestions}
                  onDismissSuggestion={onDismissSuggestion}
                />
              ))}
              {checked.map((item) => (
                <SingleItemRow
                  key={item.id}
                  item={item}
                  onToggle={onToggleItem}
                  ownedMasterIds={ownedMasterIds}
                  onAddToCabinet={onAddToCabinet}
                  dismissedSuggestions={dismissedSuggestions}
                  onDismissSuggestion={onDismissSuggestion}
                />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// By Category view
// ---------------------------------------------------------------------------

function ByCategoryView({
  items,
  onToggleGroup,
}: {
  items: GroceryItem[]
  onToggleGroup: (key: string, val: boolean) => void
}) {
  const categories = buildByCategory(items)

  return (
    <>
      {categories.map(({ category, entries }) => {
        const unchecked = entries.filter((e) => !e.is_checked)
        const checked = entries.filter((e) => e.is_checked)
        const total = entries.length
        return (
          <div key={category} style={{ marginBottom: '28px' }}>
            <SectionHeader label={category} count={total} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {unchecked.map((entry) => (
                <MergedItemRow key={entry.ingredient_key} entry={entry} onToggle={onToggleGroup} />
              ))}
              {checked.map((entry) => (
                <MergedItemRow key={entry.ingredient_key} entry={entry} onToggle={onToggleGroup} />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}
