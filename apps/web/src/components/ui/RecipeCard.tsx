import { Link } from 'react-router-dom'
import type { RecipeSummary } from '../../api/recipes'

interface RecipeCardProps {
  recipe: RecipeSummary
}

const DIFFICULTY_COLOR = {
  easy: '#16a34a',
  medium: '#d97706',
  hard: '#dc2626',
}

function formatTime(mins: number | null): string | null {
  if (!mins) return null
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const totalTime = formatTime((recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0))

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--color-border)',
        transition: 'box-shadow 0.2s, transform 0.2s',
        cursor: 'pointer',
      }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.boxShadow = 'var(--shadow-md)'
          el.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.boxShadow = 'var(--shadow-sm)'
          el.style.transform = 'translateY(0)'
        }}
      >
        {/* Cover image */}
        <div style={{
          height: '180px',
          background: recipe.cover_url
            ? `url(${recipe.cover_url}) center/cover`
            : 'linear-gradient(135deg, var(--color-primary-light), var(--color-border))',
          position: 'relative',
        }}>
          {recipe.status === 'draft' && (
            <span style={{
              position: 'absolute', top: '10px', left: '10px',
              background: 'rgba(0,0,0,0.6)', color: '#fff',
              fontSize: '11px', fontWeight: 600, padding: '2px 8px',
              borderRadius: 'var(--radius-sm)', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>Draft</span>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '14px 16px 16px' }}>
          <h3 style={{
            fontSize: '15px', fontWeight: 600, lineHeight: 1.3,
            color: 'var(--color-text)', marginBottom: '8px',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {recipe.title}
          </h3>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {recipe.difficulty && (
              <span style={{
                fontSize: '12px', fontWeight: 500,
                color: DIFFICULTY_COLOR[recipe.difficulty],
              }}>
                {recipe.difficulty.charAt(0).toUpperCase() + recipe.difficulty.slice(1)}
              </span>
            )}
            {recipe.cuisine && (
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                {recipe.cuisine}
              </span>
            )}
            {totalTime && (
              <span style={{
                fontSize: '12px', color: 'var(--color-text-muted)',
                marginLeft: 'auto',
              }}>
                {totalTime}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
