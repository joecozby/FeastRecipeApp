import { useNavigate } from 'react-router-dom'
import { useRecipes, RecipeSummary } from '../api/recipes'
import { useAuthStore } from '../store/authStore'
import { RecipeCard } from '../components/ui/RecipeCard'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'

export default function HomePage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { data, isLoading } = useRecipes({ status: 'published' })

  const recentRecipes = data?.pages[0]?.data?.slice(0, 6) ?? []
  const totalCount = data?.pages.flatMap((p) => p.data).length ?? 0

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      <div style={{
        background: 'linear-gradient(135deg, var(--color-primary) 0%, #c4501e 100%)',
        borderRadius: 'var(--radius-xl)', padding: '32px 36px', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px',
      }}>
        <div>
          <p style={{ fontSize: '14px', opacity: 0.85, marginBottom: '4px' }}>{greeting}</p>
          <h1 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '12px' }}>
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            {totalCount > 0
              ? `You have ${totalCount} published recipe${totalCount === 1 ? '' : 's'} in your collection.`
              : 'Your recipe collection is empty. Import your first recipe to get started.'}
          </p>
        </div>
        <Button onClick={() => navigate('/import')} style={{ background: '#fff', color: 'var(--color-primary)', flexShrink: 0 }}>
          + Import Recipe
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {[
          { label: 'All Recipes',  icon: '🍽', path: '/recipes' },
          { label: 'Cookbooks',    icon: '📖', path: '/cookbooks' },
          { label: 'Grocery List', icon: '🛒', path: '/grocery' },
        ].map(({ label, icon, path }) => (
          <button key={label} onClick={() => navigate(path)} style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', padding: '20px 24px', textAlign: 'left',
            cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.15s',
            fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '12px',
          }}
            onMouseEnter={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.boxShadow = 'var(--shadow-md)'; el.style.transform = 'translateY(-1px)' }}
            onMouseLeave={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.boxShadow = 'none'; el.style.transform = 'translateY(0)' }}
          >
            <span style={{ fontSize: '24px' }}>{icon}</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>{label}</span>
          </button>
        ))}
      </div>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Recent recipes</h2>
          <button onClick={() => navigate('/recipes')} style={{ background: 'none', border: 'none', fontSize: '13px', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 500 }}>
            View all →
          </button>
        </div>
        {isLoading ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading...</p>
        ) : recentRecipes.length === 0 ? (
          <EmptyState icon="🍽" title="No published recipes yet" description="Import and publish recipes to see them here." action={<Button onClick={() => navigate('/import')}>Import a recipe</Button>} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
            {recentRecipes.map((recipe: RecipeSummary) => <RecipeCard key={recipe.id} recipe={recipe} />)}
          </div>
        )}
      </section>
    </div>
  )
}
