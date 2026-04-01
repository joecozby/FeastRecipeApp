import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const NAV_ITEMS = [
  { to: '/recipes',   label: 'Recipes',   icon: '🍽' },
  { to: '/import',    label: 'Import',    icon: '＋' },
  { to: '/search',    label: 'Search',    icon: '🔍' },
  { to: '/cookbooks', label: 'Cookbooks', icon: '📖' },
  { to: '/grocery',   label: 'Grocery',   icon: '🛒' },
  { to: '/ai',        label: 'AI Chef',   icon: '✨' },
]

export function PrivateRoute() {
  const token = useAuthStore((s) => s.token)
  return token ? <AppShell /> : <Navigate to="/login" replace />
}

function AppShell() {
  const { user } = useAuthStore()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Sidebar */}
      <nav style={{
        width: 'var(--nav-width)',
        minHeight: '100vh',
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{
          padding: '24px 20px 20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <span style={{
            fontSize: '22px', fontWeight: 700,
            color: 'var(--color-primary)', letterSpacing: '-0.5px',
          }}>
            Feast
          </span>
        </div>

        {/* Nav links */}
        <div style={{ padding: '12px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                background: isActive ? 'var(--color-primary-light)' : 'transparent',
                textDecoration: 'none',
                transition: 'background 0.15s',
              })}
            >
              <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </div>

        {/* Profile nav card */}
        <div style={{ padding: '10px 8px 12px', borderTop: '1px solid var(--color-border)' }}>
          <NavLink
            to="/profile"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              background: isActive ? 'var(--color-primary-light)' : 'transparent',
              transition: 'background 0.15s',
              cursor: 'pointer',
            })}
          >
            {/* Avatar initial */}
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, var(--color-primary) 0%, #c4501e 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 700, color: '#fff',
            }}>
              {(user?.email ?? '?')[0].toUpperCase()}
            </div>
            {/* Name / email */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '13px', fontWeight: 500, color: 'var(--color-text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {user?.email}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                Account &amp; settings
              </div>
            </div>
          </NavLink>
        </div>
      </nav>

      {/* Main content */}
      <main style={{
        marginLeft: 'var(--nav-width)',
        flex: 1,
        minHeight: '100vh',
        padding: '32px',
        maxWidth: 'calc(var(--content-max) + var(--nav-width))',
      }}>
        <Outlet />
      </main>
    </div>
  )
}
