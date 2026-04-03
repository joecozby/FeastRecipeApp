import { useRef, useCallback } from 'react'
import { useSearch } from '../api/search'
import { RecipeCard } from '../components/ui/RecipeCard'
import { useFilterState } from '../hooks/useFilterState'
import { useMobile } from '../hooks/useMobile'

export default function SearchPage() {
  const isMobile = useMobile()
  const [q, setQ] = useFilterState<string>('q', '')

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useSearch({
    q: q || undefined,
  })

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
  const totalCount = data?.pages[0]?.total ?? null

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '20px' }}>Search Recipes</h1>

      {/* Search bar */}
      <div style={{ marginBottom: '28px' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title, ingredient, cuisine, difficulty, tags..."
          autoFocus={!isMobile}
          style={{
            width: '100%', padding: '11px 16px',
            borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)',
            background: 'var(--color-surface)', fontSize: '15px',
            color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
            boxSizing: 'border-box', outline: 'none',
          }}
        />
      </div>

      {/* Results */}
      {!q ? (
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
          Enter a search term to find recipes.
        </p>
      ) : isLoading ? (
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Searching...</p>
      ) : allRecipes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</p>
          <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>No recipes found</p>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Try a different search term.</p>
        </div>
      ) : (
        <>
          {totalCount !== null && (
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              {totalCount} result{totalCount === 1 ? '' : 's'}
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
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
