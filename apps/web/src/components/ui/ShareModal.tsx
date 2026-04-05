import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { X, Copy, Check, Share2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Context detection — what page is the user on?
// ---------------------------------------------------------------------------

interface ShareContext {
  emoji: string
  label: string
  description: string
}

function getShareContext(pathname: string): ShareContext {
  if (/^\/recipes\/[^/]+/.test(pathname))
    return { emoji: '🍳', label: 'Recipe',        description: 'Share this recipe'           }
  if (pathname.startsWith('/recipes'))
    return { emoji: '🍴', label: 'Recipes',       description: 'Share your recipe collection' }
  if (/^\/cookbooks\/[^/]+/.test(pathname))
    return { emoji: '📖', label: 'Cookbook',      description: 'Share this cookbook'          }
  if (pathname.startsWith('/cookbooks'))
    return { emoji: '📚', label: 'Cookbooks',     description: 'Share your cookbooks'         }
  if (pathname === '/grocery')
    return { emoji: '🛒', label: 'Grocery List',  description: 'Share your grocery list'      }
  if (pathname === '/profile')
    return { emoji: '👤', label: 'Profile',       description: 'Share your Feast profile'     }
  if (pathname === '/search')
    return { emoji: '🔍', label: 'Search',        description: 'Share this search'            }
  return   { emoji: '🍽️', label: 'Feast',         description: 'Share the Feast app'          }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ShareModalProps {
  onClose: () => void
}

export function ShareModal({ onClose }: ShareModalProps) {
  const location = useLocation()
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const shareUrl = window.location.href
  const { emoji, label, description } = getShareContext(location.pathname)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // Fallback: select text so user can manually copy
      inputRef.current?.select()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  async function handleNativeShare() {
    try {
      await navigator.share({ title: `Feast — ${label}`, url: shareUrl })
    } catch {
      // User cancelled — no-op
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 300,
          animation: 'fadeIn 0.15s ease',
        }}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share"
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          padding: '24px',
          width: 'min(420px, calc(100vw - 32px))',
          zIndex: 301,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          animation: 'popIn 0.18s var(--ease-out)',
        }}
      >
        <style>{`
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes popIn  {
            from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
            to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
        `}</style>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Share2 size={17} color="var(--color-primary)" />
            <span style={{ fontSize: '16px', fontWeight: 700 }}>Share</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
              color: 'var(--color-text-muted)', display: 'flex', borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Context badge — what's being shared */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '12px 14px',
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          border: '1px solid var(--color-border)',
        }}>
          <span style={{ fontSize: '26px', lineHeight: 1 }}>{emoji}</span>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, margin: 0, color: 'var(--color-text)' }}>
              {label}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
              {description}
            </p>
          </div>
        </div>

        {/* URL row */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: canNativeShare ? '12px' : '0' }}>
          <input
            ref={inputRef}
            readOnly
            value={shareUrl}
            onFocus={e => e.target.select()}
            style={{
              flex: 1, minWidth: 0,
              padding: '9px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              fontSize: '13px',
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-sans)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              outline: 'none',
              cursor: 'text',
            }}
          />
          <button
            onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '9px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: copied ? '#16a34a' : 'var(--color-primary)',
              color: '#fff',
              fontSize: '13px', fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              flexShrink: 0,
              transition: 'background 0.2s',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Native share button — shown on devices that support it (mostly mobile) */}
        {canNativeShare && (
          <button
            onClick={handleNativeShare}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              width: '100%',
              padding: '10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: 'none',
              fontSize: '14px', fontWeight: 500,
              color: 'var(--color-text)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              marginTop: '8px',
            }}
          >
            <Share2 size={15} />
            Share via…
          </button>
        )}
      </div>
    </>
  )
}
