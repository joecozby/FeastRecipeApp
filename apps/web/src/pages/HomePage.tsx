import { useNavigate } from 'react-router-dom'
import { UtensilsCrossed, BookOpen, ShoppingCart } from 'lucide-react'
import { useRecipes, RecipeSummary } from '../api/recipes'
import { useAuthStore } from '../store/authStore'
import { RecipeCard } from '../components/ui/RecipeCard'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useMobile } from '../hooks/useMobile'

const QUICK_NAV = [
  { label: 'All Recipes',  Icon: UtensilsCrossed, path: '/recipes' },
  { label: 'Cookbooks',    Icon: BookOpen,         path: '/cookbooks' },
  { label: 'Grocery List', Icon: ShoppingCart,     path: '/grocery' },
]

export default function HomePage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isMobile = useMobile()
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '28px' : '40px' }}>

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
        borderRadius: 'var(--radius-xl)',
        padding: isMobile ? '24px 20px' : '32px 36px',
        color: '#fff',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: '20px',
      }}>
        <div>
          <p style={{ fontSize: '13px', opacity: 0.85, marginBottom: '4px', fontFamily: 'var(--font-sans)' }}>
            {greeting}
          </p>
          <h1 style={{
            fontSize: isMobile ? '24px' : '28px',
            fontWeight: 700, marginBottom: '10px',
            fontFamily: 'var(--font-display)',
          }}>
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.9, fontFamily: 'var(--font-sans)' }}>
            {totalCount > 0
              ? `You have ${totalCount} published recipe${totalCount === 1 ? '' : 's'} in your collection.`
              : 'Your recipe collection is empty. Import your first recipe to get started.'}
          </p>
        </div>
        <Button
          onClick={() => navigate('/import')}
          style={{
            background: '#fff', color: 'var(--color-primary)',
            flexShrink: 0,
            alignSelf: isMobile ? 'stretch' : 'auto',
            justifyContent: 'center',
          }}
        >
          + Import Recipe
        </Button>
      </div>

      {/* Quick nav */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: '12px',
      }}>
        {QUICK_NAV.map(({ label, Icon, path }) => (
          <button
            key={label}
            onClick={() => navigate(path)}
            style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)', padding: '18px 20px', textAlign: 'left',
              cursor: 'pointer', transition: 'box-shadow 0.2s var(--ease-out), transform 0.2s var(--ease-out)',
              fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '12px',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.boxShadow = 'var(--shadow-md)'
              el.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.boxShadow = 'none'
              el.style.transform = 'translateY(0)'
            }}
          >
            <div style={{
              width: '38px', height: '38px', borderRadius: 'var(--radius-sm)', flexShrink: 0,
              background: 'var(--color-primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={18} color="var(--color-primary)" strokeWidth={2} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>{label}</span>
          </button>
        ))}
      </div>

      {/* Recent recipes */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'var(--font-display)' }}>
            Recent recipes
          </h2>
          <button
            onClick={() => navigate('/recipes')}
            style={{ background: 'none', border: 'none', fontSize: '13px', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 500 }}
          >
            View all →
          </button>
        </div>

        {isLoading ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading...</p>
        ) : recentRecipes.length === 0 ? (
          <EmptyState
            icon="🍽"
            title="No published recipes yet"
            description="Import and publish recipes to see them here."
            action={<Button onClick={() => navigate('/import')}>Import a recipe</Button>}
          />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? 'repeat(auto-fill, minmax(160px, 1fr))'
              : 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '16px',
          }}>
            {recentRecipes.map((recipe: RecipeSummary) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
