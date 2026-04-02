import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading,
      children,
      disabled,
      style,
      onMouseEnter,
      onMouseLeave,
      onMouseDown,
      onMouseUp,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    const base: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      borderRadius: 'var(--radius-md)',
      border: 'none',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      transition: 'background 0.15s, transform 0.15s, box-shadow 0.15s',
      opacity: isDisabled ? 0.55 : 1,
      whiteSpace: 'nowrap',
      letterSpacing: '-0.01em',
    }

    const sizes: Record<string, React.CSSProperties> = {
      sm: { fontSize: '13px', padding: '6px 14px',  height: '32px' },
      md: { fontSize: '14px', padding: '9px 18px',  height: '38px' },
      lg: { fontSize: '15px', padding: '12px 24px', height: '46px' },
    }

    const variants: Record<string, React.CSSProperties> = {
      primary:   { background: 'var(--color-primary)',  color: '#fff' },
      secondary: { background: 'var(--color-silver)',   color: 'var(--color-text)', border: '1px solid var(--color-border)' },
      ghost:     { background: 'transparent',           color: 'var(--color-text-muted)' },
      danger:    { background: 'var(--color-hard)',     color: '#fff' },
    }

    const hoverBg: Record<string, string> = {
      primary:   'var(--color-primary-hover)',
      secondary: '#EDEFF1',
      ghost:     'var(--color-silver)',
      danger:    '#C82333',
    }

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
        onMouseEnter={(e) => {
          if (!isDisabled) e.currentTarget.style.background = hoverBg[variant]
          onMouseEnter?.(e)
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = variants[variant].background as string
          e.currentTarget.style.transform = 'scale(1)'
          onMouseLeave?.(e)
        }}
        onMouseDown={(e) => {
          if (!isDisabled) e.currentTarget.style.transform = 'scale(0.96)'
          onMouseDown?.(e)
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          onMouseUp?.(e)
        }}
        {...props}
      >
        {loading ? <span style={{ opacity: 0.7, letterSpacing: '0.1em' }}>···</span> : children}
      </button>
    )
  }
)
Button.displayName = 'Button'
