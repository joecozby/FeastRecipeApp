import { useRef, useCallback } from 'react'
import { useSearch } from '../api/search'
import { RecipeCard } from '../components/ui/RecipeCard'
import { useFilterState } from '../hooks/useFilterState'

export default function SearchPage() {
  const [q, setQ]             = useFilterState<string>('q', '')
  const [cuisine, setCuisine] = useFilterState<string>('cuisine', '')
  const [difficulty, setDifficulty] = useFilterState<'' | 'easy' | 'medium' | 'hard'>('difficulty', '')
  const [tags, setTags]       = useFilterState<string>('tags', '')

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useSearch({
    q: q || undefined,
    cuisine: cuisine || undefined,
    difficulty: difficulty || undefined,
    tags: tags || undefined,
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
  const hasFilters = q || cuisine || difficulty || tags
  const totalCount = data?.pages[0]?.total ?? null

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '20px' }}>Search Recipes</h1>

      {/* Search bar */}
      <div style={{ marginBottom: '16px' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title, ingredient, or description..."
          autoFocus
          style={{
            width: '100%', padding: '11px 16px',
            borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)',
            background: 'var(--color-surface)', fontSize: '15px',
            color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
            boxSizing: 'border-box', outline: 'none',
          }}
        />
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
        <input
          value={cuisine}
          onChange={(e) => setCuisine(e.target.value)}
          placeholder="Cuisine (e.g. Italian)"
          style={{
            padding: '7px 12px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            fontSize: '13px', color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
          }}
        />
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as '' | 'easy' | 'medium' | 'hard')}
          style={{
            padding: '7px 12px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            fontSize: '13px', color: difficulty ? 'var(--color-text)' : 'var(--color-text-muted)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <option value="">Any difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags (comma-separated)"
          style={{
            padding: '7px 12px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            fontSize: '13px', color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
          }}
        />
        {(cuisine || difficulty || tags) && (
          <button
            onClick={() => { setCuisine(''); setDifficulty(''); setTags('') }}
            style={{ background: 'none', border: 'none', fontSize: '13px', color: 'var(--color-primary)', cursor: 'pointer', padding: '7px 0' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results */}
      {!hasFilters ? (
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
          Enter a search term or apply filters to find recipes.
        </p>
      ) : isLoading ? (
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Searching...</p>
      ) : allRecipes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</p>
          <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>No recipes found</p>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Try adjusting your search or filters.</p>
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
