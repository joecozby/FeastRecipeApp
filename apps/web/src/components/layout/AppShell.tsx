import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom'
import { Suspense, useState, useRef, useEffect } from 'react'
import {
  UtensilsCrossed,
  PlusCircle,
  Search,
  BookOpen,
  ShoppingCart,
  Sparkles,
  User,
  FlameKindling,
  X,
  ArrowLeft,
  Send,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useMobile } from '../../hooks/useMobile'
import { useCookbooks, type CookbookSummary } from '../../api/cookbooks'
import { useSearch } from '../../api/search'
import type { RecipeSummary } from '../../api/recipes'
import { ShareModal } from '../ui/ShareModal'

const NAV_ITEMS = [
  { to: '/recipes',       label: 'Recipes',       Icon: UtensilsCrossed },
  { to: '/import',        label: 'Import',        Icon: PlusCircle },
  { to: '/search',        label: 'Search',        Icon: Search },
  { to: '/cookbooks',     label: 'Cookbooks',     Icon: BookOpen },
  { to: '/grocery',       label: 'Grocery',       Icon: ShoppingCart },
  { to: '/spice-cabinet', label: 'Spice Cabinet', Icon: FlameKindling },
  { to: '/ai',            label: 'AI Chef',       Icon: Sparkles },
]

// Mobile bottom nav — Search removed; it lives in the top bar instead
const BOTTOM_NAV_ITEMS = [
  { to: '/recipes',       Icon: UtensilsCrossed, label: 'Recipes'       },
  { to: '/import',        Icon: PlusCircle,      label: 'Import', primary: true },
  { to: '/cookbooks',     Icon: BookOpen,        label: 'Cookbooks'     },
  { to: '/grocery',       Icon: ShoppingCart,    label: 'Grocery'       },
  { to: '/ai',            Icon: Sparkles,        label: 'AI Chef'       },
  { to: '/spice-cabinet', Icon: FlameKindling,   label: 'Cabinet'       },
  { to: '/profile',       Icon: User,            label: 'Profile'       },
]

// ---------------------------------------------------------------------------
// Mobile search overlay
// ---------------------------------------------------------------------------

function MobileSearchOverlay({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Cookbooks — client-side filter
  const { data: allCookbooks } = useCookbooks()

  // Recipes — API search (first page only for overlay)
  const { data: searchData, isLoading: recipesLoading } = useSearch({ q: q.trim() || undefined })

  useEffect(() => {
    // Small delay so the transition doesn't fight with focus
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  // Close on back-button / escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const trimmed = q.trim()

  const matchingCookbooks: CookbookSummary[] = trimmed
    ? (allCookbooks ?? []).filter((cb: CookbookSummary) =>
        cb.title.toLowerCase().includes(trimmed.toLowerCase())
      )
    : []

  const allRecipes: RecipeSummary[] = searchData?.pages.flatMap((p: { data: RecipeSummary[] }) => p.data) ?? []

  function goTo(path: string) {
    navigate(path)
    onClose()
  }

  const hasResults = matchingCookbooks.length > 0 || allRecipes.length > 0

  return (
    <div
      style={{
        position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0,
        background: 'var(--color-bg)',
        zIndex: 98,
        display: 'flex', flexDirection: 'column',
        animation: 'slideDown 0.18s var(--ease-out)',
      }}
    >
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Search input bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 16px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <Search size={17} color="var(--color-text-muted)" strokeWidth={2} style={{ flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search recipes and cookbooks…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            fontSize: '16px', // 16px prevents iOS keyboard zoom
            color: 'var(--color-text)',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
          }}
        />
        {q ? (
          <button
            onClick={() => setQ('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--color-text-muted)', display: 'flex' }}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {/* ── Results ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0 32px' }}>

        {!trimmed ? (
          <p style={{
            fontSize: '14px', color: 'var(--color-text-muted)',
            textAlign: 'center', padding: '48px 24px',
          }}>
            Search by recipe title, ingredient, cuisine, or cookbook name
          </p>
        ) : (
          <>
            {/* ── Cookbooks section ── */}
            {matchingCookbooks.length > 0 && (
              <section>
                <p style={{
                  fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'var(--color-text-muted)',
                  padding: '12px 20px 6px',
                }}>
                  Cookbooks
                </p>
                {matchingCookbooks.map(cb => (
                  <button
                    key={cb.id}
                    onClick={() => goTo(`/cookbooks/${cb.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      width: '100%', padding: '10px 20px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-silver)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {/* Cookbook thumbnail */}
                    {cb.cover_photos && cb.cover_photos.length > 0 ? (
                      <img
                        src={cb.cover_photos[0]}
                        alt=""
                        style={{
                          width: '40px', height: '40px',
                          borderRadius: 'var(--radius-sm)',
                          objectFit: 'cover', flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '40px', height: '40px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '20px', flexShrink: 0,
                      }}>📖</div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <p style={{
                        fontSize: '14px', fontWeight: 500, color: 'var(--color-text)',
                        margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {cb.title}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                        {cb.recipe_count} recipe{cb.recipe_count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <BookOpen size={14} color="var(--color-text-muted)" style={{ marginLeft: 'auto', flexShrink: 0 }} />
                  </button>
                ))}
              </section>
            )}

            {/* ── Recipes section ── */}
            <section>
              <p style={{
                fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.07em', color: 'var(--color-text-muted)',
                padding: '12px 20px 6px',
              }}>
                Recipes
              </p>

              {recipesLoading ? (
                <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', padding: '12px 20px' }}>
                  Searching…
                </p>
              ) : allRecipes.length === 0 ? (
                <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', padding: '12px 20px' }}>
                  No recipes found.
                </p>
              ) : (
                allRecipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    onClick={() => goTo(`/recipes/${recipe.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      width: '100%', padding: '10px 20px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-silver)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {/* Recipe thumbnail */}
                    {recipe.cover_url ? (
                      <img
                        src={recipe.cover_url}
                        alt=""
                        style={{
                          width: '40px', height: '40px',
                          borderRadius: 'var(--radius-sm)',
                          objectFit: 'cover', flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '40px', height: '40px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-silver)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '20px', flexShrink: 0,
                      }}>🍽️</div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{
                        fontSize: '14px', fontWeight: 500, color: 'var(--color-text)',
                        margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {recipe.title}
                      </p>
                      {(recipe.cuisine || recipe.difficulty) && (
                        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                          {[recipe.cuisine, recipe.difficulty].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <UtensilsCrossed size={14} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                  </button>
                ))
              )}

              {/* "See all" link when there are many results */}
              {allRecipes.length >= 10 && (
                <button
                  onClick={() => goTo(`/search?q=${encodeURIComponent(trimmed)}`)}
                  style={{
                    display: 'block', width: '100%', padding: '12px 20px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '13px', color: 'var(--color-primary)', fontWeight: 600,
                    textAlign: 'left', fontFamily: 'var(--font-sans)',
                  }}
                >
                  See all results for "{trimmed}" →
                </button>
              )}
            </section>

            {/* Empty state when nothing at all matches */}
            {!recipesLoading && !hasResults && (
              <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                <p style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</p>
                <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No results found</p>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  Try a different search term.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PrivateRoute + AppShell
// ---------------------------------------------------------------------------

export function PrivateRoute() {
  const token = useAuthStore((s) => s.token)
  return token ? <AppShell /> : <Navigate to="/login" replace />
}

function AppShell() {
  const { user } = useAuthStore()
  const isMobile = useMobile()
  const [searchOpen, setSearchOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  // Close overlays whenever we leave mobile (e.g. resize to desktop)
  useEffect(() => {
    if (!isMobile) { setSearchOpen(false); setShareOpen(false) }
  }, [isMobile])

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

          {/* Share button */}
          <div style={{ padding: '0 8px 4px' }}>
            <button
              onClick={() => setShareOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                width: '100%', padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: 400,
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-sans)',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--color-primary-light)'
                e.currentTarget.style.color = 'var(--color-primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.color = 'var(--color-text-muted)'
              }}
            >
              <Send size={18} strokeWidth={1.75} />
              Share
            </button>
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
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 100,
        }}>
          {/* Wordmark — or back arrow when overlay is open */}
          {searchOpen ? (
            <button
              onClick={() => setSearchOpen(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
                color: 'var(--color-primary)', padding: '4px',
              }}
            >
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
          ) : (
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '22px', fontWeight: 700,
              color: 'var(--color-primary)', letterSpacing: '-0.5px',
            }}>
              Feast
            </div>
          )}

          {/* Right-side icon buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            {/* Share button — hidden when search overlay is open */}
            {!searchOpen && (
              <button
                onClick={() => setShareOpen(prev => !prev)}
                aria-label="Share"
                style={{
                  background: shareOpen ? 'var(--color-primary-light)' : 'none',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '36px', height: '36px',
                  borderRadius: 'var(--radius-sm)',
                  color: shareOpen ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <Send size={20} strokeWidth={1.75} />
              </button>
            )}

            {/* Search button */}
            <button
              onClick={() => { setSearchOpen(prev => !prev); setShareOpen(false) }}
              aria-label="Search"
              style={{
                background: searchOpen ? 'var(--color-primary-light)' : 'none',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px',
                borderRadius: 'var(--radius-sm)',
                color: searchOpen ? 'var(--color-primary)' : 'var(--color-text-muted)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <Search size={20} strokeWidth={1.75} />
            </button>
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
        // Prevent scrolling behind overlay
        overflow: isMobile && searchOpen ? 'hidden' : undefined,
      }}>
        <Suspense fallback={
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '60vh', color: 'var(--color-text-muted)', fontSize: '14px',
          }}>
            Loading...
          </div>
        }>
          <Outlet />
        </Suspense>
      </main>

      {/* ── Mobile search overlay ────────────────────────── */}
      {isMobile && searchOpen && (
        <MobileSearchOverlay onClose={() => setSearchOpen(false)} />
      )}

      {/* ── Share modal (desktop + mobile) ───────────────── */}
      {shareOpen && (
        <ShareModal onClose={() => setShareOpen(false)} />
      )}

      {/* ── Mobile bottom nav ────────────────────────────── */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: '56px',
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          zIndex: 100,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {BOTTOM_NAV_ITEMS.map(({ to, Icon, label, primary }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              onClick={() => { setSearchOpen(false); setShareOpen(false) }}
              style={({ isActive }) => ({
                flex: 1,
                display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                transition: 'color 0.15s',
                minWidth: 0,
              })}
            >
              {primary ? (
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: 'var(--color-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={20} strokeWidth={2} color="#fff" />
                </div>
              ) : (
                <Icon size={22} strokeWidth={1.75} />
              )}
            </NavLink>
          ))}
        </nav>
      )}

    </div>
  )
}
