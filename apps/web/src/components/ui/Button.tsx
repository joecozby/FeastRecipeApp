import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, disabled, style, ...props }, ref) => {
    const base: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      fontWeight: 500,
      borderRadius: 'var(--radius-md)',
      border: 'none',
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      transition: 'background 0.15s, opacity 0.15s',
      opacity: disabled || loading ? 0.6 : 1,
      whiteSpace: 'nowrap',
    }

    const sizes: Record<string, React.CSSProperties> = {
      sm: { fontSize: '13px', padding: '6px 12px', height: '32px' },
      md: { fontSize: '14px', padding: '8px 16px', height: '38px' },
      lg: { fontSize: '15px', padding: '10px 20px', height: '44px' },
    }

    const variants: Record<string, React.CSSProperties> = {
      primary: { background: 'var(--color-primary)', color: '#fff' },
      secondary: { background: 'var(--color-border)', color: 'var(--color-text)' },
      ghost: { background: 'transparent', color: 'var(--color-text-muted)' },
      danger: { background: '#dc2626', color: '#fff' },
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
        {...props}
      >
        {loading ? <span style={{ fontSize: '12px' }}>...</span> : children}
      </button>
    )
  }
)
Button.displayName = 'Button'
