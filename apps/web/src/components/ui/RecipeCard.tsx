import { Link } from 'react-router-dom'
import { Bookmark } from 'lucide-react'
import type { RecipeSummary } from '../../api/recipes'
import { useSaveRecipe, useUnsaveRecipe } from '../../api/recipes'

interface RecipeCardProps {
  recipe: RecipeSummary
  /** Show save/unsave bookmark button (for feed & saved views) */
  showSave?: boolean
}

const DIFFICULTY_STYLE: Record<string, { bg: string; color: string }> = {
  easy:   { bg: 'var(--color-easy-bg)',   color: 'var(--color-easy)'   },
  medium: { bg: 'var(--color-medium-bg)', color: 'var(--color-medium)' },
  hard:   { bg: 'var(--color-hard-bg)',   color: 'var(--color-hard)'   },
}

function formatTime(mins: number | null): string | null {
  if (!mins) return null
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function SaveButton({ recipeId, isSaved }: { recipeId: string; isSaved: boolean }) {
  const saveMutation = useSaveRecipe()
  const unsaveMutation = useUnsaveRecipe()
  const pending = saveMutation.isPending || unsaveMutation.isPending

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return
    if (isSaved) unsaveMutation.mutate(recipeId)
    else saveMutation.mutate(recipeId)
  }

  return (
    <button
      onClick={toggle}
      title={isSaved ? 'Unsave recipe' : 'Save recipe'}
      style={{
        position: 'absolute', top: '10px', right: '10px',
        width: '32px', height: '32px', borderRadius: '50%',
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)',
        border: 'none', cursor: pending ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isSaved ? '#f59e0b' : '#fff',
        transition: 'background 0.15s, color 0.15s',
        opacity: pending ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!pending) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.65)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.45)'
      }}
    >
      <Bookmark
        size={15}
        fill={isSaved ? 'currentColor' : 'none'}
        strokeWidth={2}
      />
    </button>
  )
}

export function RecipeCard({ recipe, showSave }: RecipeCardProps) {
  const totalTime = formatTime((recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0))
  const diffStyle = recipe.difficulty ? DIFFICULTY_STYLE[recipe.difficulty] : null

  return (
    <Link to={`/recipes/${recipe.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--color-border)',
          transition: 'box-shadow 0.3s var(--ease-out), transform 0.3s var(--ease-out)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.boxShadow = 'var(--shadow-lg)'
          el.style.transform = 'translateY(-3px)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.boxShadow = 'var(--shadow-md)'
          el.style.transform = 'translateY(0)'
        }}
      >
        {/* Cover image */}
        <div style={{
          height: '180px',
          background: recipe.cover_url
            ? `url(${recipe.cover_url}) center/cover`
            : 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {!recipe.cover_url && (
            <img src="/logo.svg" alt="" style={{ height: '72px', opacity: 0.9 }} />
          )}
          {recipe.status === 'draft' && (
            <span style={{
              position: 'absolute', top: '10px', left: '10px',
              background: 'rgba(0,0,0,0.55)', color: '#fff',
              fontSize: '10px', fontWeight: 700, padding: '3px 9px',
              borderRadius: 'var(--radius-full)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              fontFamily: 'var(--font-sans)',
            }}>Private</span>
          )}
          {showSave && (
            <SaveButton
              recipeId={recipe.id}
              isSaved={recipe.is_saved ?? false}
            />
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '14px 16px 16px' }}>
          {/* Owner name — shown for feed/saved cards */}
          {recipe.owner_name && (
            <p style={{
              fontSize: '11px', color: 'var(--color-text-muted)',
              marginBottom: '5px', fontFamily: 'var(--font-sans)',
            }}>
              by {recipe.owner_name}
            </p>
          )}

          <h3 style={{
            fontSize: '16px',
            fontWeight: 600,
            fontFamily: 'var(--font-display)',
            lineHeight: 1.3,
            color: 'var(--color-text)',
            marginBottom: '9px',
            height: '42px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {recipe.title}
          </h3>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {diffStyle && recipe.difficulty && (
              <span style={{
                fontSize: '11px', fontWeight: 700,
                color: diffStyle.color, background: diffStyle.bg,
                padding: '3px 10px', borderRadius: 'var(--radius-full)',
                fontFamily: 'var(--font-sans)', letterSpacing: '0.02em',
              }}>
                {recipe.difficulty.charAt(0).toUpperCase() + recipe.difficulty.slice(1)}
              </span>
            )}
            {recipe.cuisine && (
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)' }}>
                {recipe.cuisine}
              </span>
            )}
            {totalTime && (
              <span style={{
                fontSize: '12px', color: 'var(--color-text-muted)',
                marginLeft: 'auto', fontFamily: 'var(--font-sans)',
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
