import { useNavigate } from 'react-router-dom'

interface LibrarySelectorProps {
  active: 'recipes' | 'cookbooks'
}

/**
 * Mobile-only inline section switcher that sits in the page header area.
 * "My Recipes  |  Cookbooks" — active label is orange + bold, inactive is muted.
 */
export function LibrarySelector({ active }: LibrarySelectorProps) {
  const navigate = useNavigate()

  const labelStyle = (section: 'recipes' | 'cookbooks') => ({
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: active === section ? 'default' : 'pointer',
    fontFamily: 'var(--font-display)',
    fontSize: '20px',
    fontWeight: active === section ? 700 : 400,
    color: active === section ? 'var(--color-primary)' : 'var(--color-text-muted)',
    letterSpacing: active === section ? '-0.3px' : '0',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    transition: 'color 0.15s',
  } as React.CSSProperties)

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <button
        style={labelStyle('recipes')}
        onClick={() => active !== 'recipes' && navigate('/recipes')}
      >
        My Recipes
      </button>

      {/* Vertical divider */}
      <div style={{
        width: '1.5px',
        height: '22px',
        background: 'var(--color-border)',
        margin: '0 12px',
        flexShrink: 0,
      }} />

      <button
        style={labelStyle('cookbooks')}
        onClick={() => active !== 'cookbooks' && navigate('/cookbooks')}
      >
        Cookbooks
      </button>
    </div>
  )
}
