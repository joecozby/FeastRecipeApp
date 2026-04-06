import { useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecipes, useFeed } from '../../api/recipes'
import { RecipeCard } from '../../components/ui/RecipeCard'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useFilterState } from '../../hooks/useFilterState'
import { useMobile } from '../../hooks/useMobile'
import { LibrarySelector } from '../../components/ui/LibrarySelector'

type TabFilter = 'feed' | 'all' | 'published' | 'draft' | 'saved'

const FILTER_TABS: { value: TabFilter; label: string }[] = [
  { value: 'feed',      label: 'Feed' },
  { value: 'all',       label: 'All' },
  { value: 'published', label: 'Public' },
  { value: 'draft',     label: 'Private' },
  { value: 'saved',     label: 'Saved' },
]

// ---------------------------------------------------------------------------
// Shared skeleton + infinite scroll helpers
// ---------------------------------------------------------------------------

function useInfiniteScroll(isFetching: boolean, hasNext: boolean, fetchNext: () => void) {
  const observer = useRef<IntersectionObserver | null>(null)
  return useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetching) return
      if (observer.current) observer.current.disconnect()
      if (!node) return
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNext) fetchNext()
      })
      observer.current.observe(node)
    },
    [isFetching, hasNext, fetchNext]
  )
}

const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: '20px',
} as const

// ---------------------------------------------------------------------------
// Feed section — public recipes from other users
// ---------------------------------------------------------------------------

function FeedSection() {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useFeed()
  const sentinelRef = useInfiniteScroll(isFetchingNextPage, hasNextPage ?? false, fetchNextPage)

  const allRecipes = data?.pages.flatMap((p) => p.data) ?? []

  if (isLoading) return <RecipeGridSkeleton />

  if (allRecipes.length === 0) {
    return (
      <EmptyState
        icon="🍳"
        title="Nothing in the feed yet"
        description="When other users make their recipes public, they'll appear here."
      />
    )
  }

  return (
    <>
      <div style={GRID_STYLE}>
        {allRecipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} showSave />
        ))}
      </div>
      <div ref={sentinelRef} style={{ height: '40px', marginTop: '16px' }} />
      {isFetchingNextPage && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
          Loading more...
        </p>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Library section — own recipes (all / public / private) or saved
// ---------------------------------------------------------------------------

function LibrarySection({ tab }: { tab: 'all' | 'published' | 'draft' | 'saved' }) {
  const navigate = useNavigate()
  const status = tab === 'all' ? undefined : tab
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useRecipes(status ? { status } : {})
  const sentinelRef = useInfiniteScroll(isFetchingNextPage, hasNextPage ?? false, fetchNextPage)

  const allRecipes = data?.pages.flatMap((p) => p.data) ?? []

  if (isLoading) return <RecipeGridSkeleton />

  if (allRecipes.length === 0) {
    if (tab === 'saved') {
      return (
        <EmptyState
          icon="🔖"
          title="No saved recipes"
          description="Browse the Feed and save recipes from other users to see them here."
        />
      )
    }
    if (tab === 'published') {
      return (
        <EmptyState
          icon="🌐"
          title="No public recipes"
          description="Make a recipe public so it appears in the community Feed."
          action={<Button onClick={() => navigate('/import')}>Import a Recipe</Button>}
        />
      )
    }
    if (tab === 'draft') {
      return (
        <EmptyState
          icon="🔒"
          title="No private recipes"
          description="Private recipes are visible only to you."
        />
      )
    }
    return (
      <EmptyState
        icon="🍽"
        title="No recipes yet"
        description="Import your first recipe from a URL, Instagram post, or pasted text."
        action={<Button onClick={() => navigate('/import')}>Import your first recipe</Button>}
      />
    )
  }

  const showSave = tab === 'saved'

  return (
    <>
      <div style={GRID_STYLE}>
        {allRecipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} showSave={showSave} />
        ))}
      </div>
      <div ref={sentinelRef} style={{ height: '40px', marginTop: '16px' }} />
      {isFetchingNextPage && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
          Loading more...
        </p>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RecipeListPage() {
  const navigate = useNavigate()
  const isMobile = useMobile()
  const [tab, setTab] = useFilterState<TabFilter>('tab', 'feed')

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', marginBottom: '24px',
      }}>
        {isMobile
          ? <LibrarySelector active="recipes" />
          : <h1 style={{ fontSize: '26px', fontWeight: 700, fontFamily: 'var(--font-display)' }}>My Recipes</h1>
        }
        <Button
          onClick={() => navigate('/import')}
          style={{ flexShrink: 0 }}
        >
          {isMobile ? '+ New' : '+ Import Recipe'}
        </Button>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '24px',
        background: 'var(--color-silver)', padding: '4px',
        borderRadius: 'var(--radius-md)', width: 'fit-content',
      }}>
        {FILTER_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            style={{
              padding: '6px 16px', borderRadius: 'var(--radius-sm)',
              border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              background: tab === t.value ? 'var(--color-primary)' : 'transparent',
              color: tab === t.value ? '#fff' : 'var(--color-text-muted)',
              boxShadow: tab === t.value ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s var(--ease-out)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'feed'
        ? <FeedSection />
        : <LibrarySection tab={tab} />
      }
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
