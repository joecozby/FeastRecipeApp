import { NavLink, Outlet, Navigate } from 'react-router-dom'
import {
  UtensilsCrossed,
  PlusCircle,
  Search,
  BookOpen,
  ShoppingCart,
  Sparkles,
  User,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useMobile } from '../../hooks/useMobile'

const NAV_ITEMS = [
  { to: '/recipes',   label: 'Recipes',   Icon: UtensilsCrossed },
  { to: '/import',    label: 'Import',    Icon: PlusCircle },
  { to: '/search',    label: 'Search',    Icon: Search },
  { to: '/cookbooks', label: 'Cookbooks', Icon: BookOpen },
  { to: '/grocery',   label: 'Grocery',   Icon: ShoppingCart },
  { to: '/ai',        label: 'AI Chef',   Icon: Sparkles },
]

// Bottom nav shows 5 key items + Profile; AI Chef is desktop-only until built
const BOTTOM_NAV_ITEMS = [
  { to: '/recipes',   label: 'Recipes',   Icon: UtensilsCrossed },
  { to: '/search',    label: 'Search',    Icon: Search },
  { to: '/import',    label: 'Import',    Icon: PlusCircle },
  { to: '/grocery',   label: 'Grocery',   Icon: ShoppingCart },
  { to: '/cookbooks', label: 'Cookbooks', Icon: BookOpen },
  { to: '/profile',   label: 'Profile',   Icon: User },
]

export function PrivateRoute() {
  const token = useAuthStore((s) => s.token)
  return token ? <AppShell /> : <Navigate to="/login" replace />
}

function AppShell() {
  const { user } = useAuthStore()
  const isMobile = useMobile()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>

      {/* ── Desktop sidebar ─────────────────────────────── */}
      {!isMobile && (
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
          {/* Wordmark */}
          <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '36px', fontWeight: 700,
              color: 'var(--color-primary)', letterSpacing: '0.01em', lineHeight: 1.1,
            }}>
              Feast
            </div>
            <div style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '10px', fontWeight: 500,
              color: 'var(--color-text-muted)',
              letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '4px',
            }}>
              Find · Cook · Share
            </div>
          </div>

          {/* Nav links */}
          <div style={{ padding: '12px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {NAV_ITEMS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                  fontSize: '14px', fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  background: isActive ? 'var(--color-primary-light)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'background 0.15s var(--ease-out), color 0.15s',
                  fontFamily: 'var(--font-sans)',
                })}
              >
                <Icon size={18} strokeWidth={1.75} />
                {label}
              </NavLink>
            ))}
          </div>

          {/* Profile nav card */}
          <div style={{ padding: '10px 8px 14px', borderTop: '1px solid var(--color-border)' }}>
            <NavLink
              to="/profile"
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                background: isActive ? 'var(--color-primary-light)' : 'transparent',
                transition: 'background 0.15s var(--ease-out)',
                cursor: 'pointer',
              })}
            >
              <div style={{
                width: '30px', height: '30px', borderRadius: 'var(--radius-full)', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 700, color: '#fff',
              }}>
                {(user?.email ?? '?')[0].toUpperCase()}
              </div>
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
      )}

      {/* ── Mobile top bar ───────────────────────────────── */}
      {isMobile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: '56px',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center',
          padding: '0 20px',
          zIndex: 100,
        }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '22px', fontWeight: 700,
            color: 'var(--color-primary)', letterSpacing: '-0.5px',
          }}>
            Feast
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────── */}
      <main style={{
        marginLeft: isMobile ? 0 : 'var(--nav-width)',
        flex: 1,
        minHeight: '100vh',
        padding: isMobile ? '72px 16px 84px' : '32px',
        maxWidth: isMobile ? '100%' : 'calc(var(--content-max) + var(--nav-width))',
      }}>
        <Outlet />
      </main>

      {/* ── Mobile bottom nav ────────────────────────────── */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: '64px',
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          zIndex: 100,
          paddingBottom: 'env(safe-area-inset-bottom)', // iPhone notch support
        }}>
          {BOTTOM_NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '3px',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                transition: 'color 0.15s',
                minWidth: 0,
              })}
            >
              <Icon size={20} strokeWidth={1.75} />
              <span style={{
                fontSize: '10px', fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                letterSpacing: '0.01em',
              }}>
                {label}
              </span>
            </NavLink>
          ))}
        </nav>
      )}

    </div>
  )
}
