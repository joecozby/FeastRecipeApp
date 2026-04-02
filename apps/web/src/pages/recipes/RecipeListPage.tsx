import { useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecipes } from '../../api/recipes'
import { RecipeCard } from '../../components/ui/RecipeCard'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useFilterState } from '../../hooks/useFilterState'
import { useMobile } from '../../hooks/useMobile'

type StatusFilter = 'all' | 'published' | 'draft'

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft',     label: 'Drafts' },
]

export default function RecipeListPage() {
  const navigate = useNavigate()
  const isMobile = useMobile()
  const [status, setStatus] = useFilterState<StatusFilter>('status', 'all')

  const queryParams = status === 'all' ? {} : { status }
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useRecipes(queryParams)

  const observer = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return
      if (observer.current) observer.current.disconnect()
      if (!node) return
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) fetchNextPage()
      })
      observer.current.observe(node)
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage]
  )

  const allRecipes = data?.pages.flatMap((p) => p.data) ?? []

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '24px',
      }}>
        <h1 style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: 700, fontFamily: 'var(--font-display)' }}>My Recipes</h1>
        {!isMobile && <Button onClick={() => navigate('/import')}>+ Import Recipe</Button>}
      </div>

      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '24px',
        background: 'var(--color-silver)', padding: '4px',
        borderRadius: 'var(--radius-md)', width: 'fit-content',
      }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            style={{
              padding: '6px 16px', borderRadius: 'var(--radius-sm)',
              border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              background: status === tab.value ? 'var(--color-primary)' : 'transparent',
              color: status === tab.value ? '#fff' : 'var(--color-text-muted)',
              boxShadow: status === tab.value ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s var(--ease-out)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <RecipeGridSkeleton />
      ) : allRecipes.length === 0 ? (
        <EmptyState
          icon="🍽"
          title="No recipes yet"
          description="Import your first recipe from a URL, Instagram post, or paste the text directly."
          action={<Button onClick={() => navigate('/import')}>Import your first recipe</Button>}
        />
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '20px',
          }}>
            {allRecipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
          <div ref={sentinelRef} style={{ height: '40px', marginTop: '16px' }} />
          {isFetchingNextPage && (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
              Loading more...
            </p>
          )}
        </>
      )}
    </div>
  )
}

function RecipeGridSkeleton() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      gap: '20px',
    }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)',
          overflow: 'hidden', background: 'var(--color-surface)',
        }}>
          <div style={{ height: '180px', background: 'var(--color-border)' }} />
          <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ height: '16px', width: '80%', background: 'var(--color-border)', borderRadius: '4px' }} />
            <div style={{ height: '12px', width: '50%', background: 'var(--color-border)', borderRadius: '4px' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
