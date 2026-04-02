import { useState } from 'react'
import {
  useSpiceCabinetMaster,
  useMySpiceCabinet,
  useAddToSpiceCabinet,
  useRemoveFromSpiceCabinet,
  SpiceMasterItem,
} from '../api/spiceCabinet'
import { useMobile } from '../hooks/useMobile'

// ---------------------------------------------------------------------------
// Pill component
// ---------------------------------------------------------------------------

function SpicePill({
  item,
  owned,
  onToggle,
  disabled,
}: {
  item: SpiceMasterItem
  owned: boolean
  onToggle: () => void
  disabled: boolean
}) {
  const [hovered, setHovered] = useState(false)

  // Owned: solid orange. Unowned: dashed-border with visible + so it's
  // obviously an "add" action, brightens to light-orange on hover.
  const baseStyle: React.CSSProperties = owned
    ? {
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '6px 13px', borderRadius: 'var(--radius-full)',
        fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        border: '1.5px solid var(--color-primary)',
        background: 'var(--color-primary)', color: '#fff',
        transition: 'opacity 0.12s', opacity: disabled ? 0.6 : 1,
        userSelect: 'none', fontFamily: 'var(--font-sans)',
      }
    : {
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '6px 12px 6px 9px', borderRadius: 'var(--radius-full)',
        fontSize: '13px', fontWeight: 500, cursor: disabled ? 'default' : 'pointer',
        border: '1.5px dashed',
        borderColor: hovered ? 'var(--color-primary)' : 'var(--color-border)',
        background: hovered ? 'rgba(232,106,51,0.07)' : 'transparent',
        color: hovered ? 'var(--color-primary)' : 'var(--color-text-muted)',
        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
        userSelect: 'none', fontFamily: 'var(--font-sans)',
        opacity: disabled ? 0.6 : 1,
      }

  return (
    <button
      style={baseStyle}
      onClick={onToggle}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={owned ? `Remove ${item.name} from cabinet` : `Add ${item.name} to cabinet`}
    >
      {owned
        ? <span style={{ fontSize: '11px', lineHeight: 1 }}>✓</span>
        : <span style={{ fontSize: '14px', lineHeight: 1, fontWeight: 700,
                         color: hovered ? 'var(--color-primary)' : 'var(--color-border)' }}>+</span>
      }
      {item.name}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Category section header
// ---------------------------------------------------------------------------

function CategoryHeader({
  category,
  ownedCount,
  totalCount,
  onCheckAll,
  onClearAll,
}: {
  category: string
  ownedCount: number
  totalCount: number
  onCheckAll: () => void
  onClearAll: () => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '4px',
      marginBottom: '10px',
      marginTop: '28px',
      paddingBottom: '8px',
      borderBottom: '1px solid var(--color-border)',
      position: 'sticky',
      top: 0,
      background: 'var(--color-bg)',
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '17px',
          fontWeight: 700,
          color: 'var(--color-text)',
          margin: 0,
        }}>
          {category}
        </h2>
        <span style={{
          fontSize: '12px',
          color: ownedCount === totalCount ? 'var(--color-primary)' : 'var(--color-text-muted)',
          fontFamily: 'var(--font-sans)',
          fontWeight: ownedCount === totalCount ? 600 : 400,
        }}>
          {ownedCount} / {totalCount}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {ownedCount < totalCount && (
          <button
            onClick={onCheckAll}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '12px',
              color: 'var(--color-primary)',
              cursor: 'pointer',
              padding: '2px 4px',
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
            }}
          >
            Check all
          </button>
        )}
        {ownedCount > 0 && (
          <button
            onClick={onClearAll}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '12px',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              padding: '2px 4px',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SpiceCabinetPage() {
  const isMobile = useMobile()
  const { data: master = [], isLoading: masterLoading } = useSpiceCabinetMaster()
  const { data: mine, isLoading: mineLoading } = useMySpiceCabinet()
  const addMutation = useAddToSpiceCabinet()
  const removeMutation = useRemoveFromSpiceCabinet()
  const [search, setSearch] = useState('')

  const ownedSet = new Set(mine?.owned ?? [])
  const totalOwned = ownedSet.size
  const totalItems = master.length

  const isLoading = masterLoading || mineLoading

  // Filter by search
  const searchLower = search.toLowerCase()
  const filtered = search
    ? master.filter((item) => item.name.toLowerCase().includes(searchLower))
    : master

  // Group by category
  const categoryMap = new Map<string, SpiceMasterItem[]>()
  for (const item of filtered) {
    if (!categoryMap.has(item.category)) categoryMap.set(item.category, [])
    categoryMap.get(item.category)!.push(item)
  }

  // Category order
  const categoryOrder = [
    'Spices & Seasonings',
    'Dried Herbs',
    'Salts',
    'Oils & Vinegars',
    'Condiment Staples',
    'Baking & Sweeteners',
    'Nuts & Seeds',
  ]
  const sortedCategories = Array.from(categoryMap.entries()).sort(([a], [b]) => {
    const ai = categoryOrder.indexOf(a)
    const bi = categoryOrder.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  function toggle(item: SpiceMasterItem) {
    if (addMutation.isPending || removeMutation.isPending) return
    if (ownedSet.has(item.id)) {
      removeMutation.mutate(item.id)
    } else {
      addMutation.mutate(item.id)
    }
  }

  function checkAll(items: SpiceMasterItem[]) {
    for (const item of items) {
      if (!ownedSet.has(item.id)) {
        addMutation.mutate(item.id)
      }
    }
  }

  function clearAll(items: SpiceMasterItem[]) {
    for (const item of items) {
      if (ownedSet.has(item.id)) {
        removeMutation.mutate(item.id)
      }
    }
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      {/* Page header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: isMobile ? '26px' : '30px',
          fontWeight: 700,
          color: 'var(--color-text)',
          margin: '0 0 4px',
        }}>
          Spice Cabinet
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: 0 }}>
          Tap any item to add it to your cabinet. Marked items show up as "In cabinet" on your grocery list.
        </p>
      </div>

      {/* Stats bar */}
      {!isLoading && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          background: totalOwned > 0 ? 'rgba(232, 106, 51, 0.08)' : 'var(--color-surface)',
          border: `1px solid ${totalOwned > 0 ? 'rgba(232, 106, 51, 0.2)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-full)',
          marginBottom: '20px',
        }}>
          <span style={{ fontSize: '18px' }}>🧂</span>
          <span style={{
            fontSize: '14px',
            fontFamily: 'var(--font-sans)',
            color: totalOwned > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontWeight: totalOwned > 0 ? 600 : 400,
          }}>
            You have <strong>{totalOwned}</strong> of {totalItems} spices &amp; staples
          </span>
        </div>
      )}

      {/* Search bar */}
      <div style={{ marginBottom: '12px' }}>
        <input
          type="search"
          placeholder="Search spices and staples..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '9px 14px',
            fontSize: '14px',
            fontFamily: 'var(--font-sans)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-input-bg)',
            color: 'var(--color-text)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px 3px 7px', borderRadius: 'var(--radius-full)',
              fontSize: '12px', fontWeight: 600,
              background: 'var(--color-primary)', color: '#fff',
              border: '1.5px solid var(--color-primary)',
            }}>
              <span style={{ fontSize: '10px' }}>✓</span> In cabinet
            </span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>tap to remove</span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px 3px 7px', borderRadius: 'var(--radius-full)',
              fontSize: '12px', fontWeight: 500,
              background: 'transparent', color: 'var(--color-text-muted)',
              border: '1.5px dashed var(--color-border)',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>+</span> Not yet added
            </span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>tap to add</span>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '32px' }}>
          Loading...
        </p>
      )}

      {/* No results */}
      {!isLoading && search && sortedCategories.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '24px' }}>
          No items match "{search}"
        </p>
      )}

      {/* Category groups */}
      {sortedCategories.map(([category, items]) => {
        const ownedInCat = items.filter((i) => ownedSet.has(i.id)).length
        return (
          <div key={category}>
            <CategoryHeader
              category={category}
              ownedCount={ownedInCat}
              totalCount={items.length}
              onCheckAll={() => checkAll(items)}
              onClearAll={() => clearAll(items)}
            />
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '4px',
            }}>
              {items.map((item) => (
                <SpicePill
                  key={item.id}
                  item={item}
                  owned={ownedSet.has(item.id)}
                  onToggle={() => toggle(item)}
                  disabled={addMutation.isPending || removeMutation.isPending}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Bottom padding for mobile */}
      {isMobile && <div style={{ height: '24px' }} />}
    </div>
  )
}
