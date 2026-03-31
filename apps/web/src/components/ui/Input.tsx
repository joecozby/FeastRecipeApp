import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '14px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  outline: 'none',
  transition: 'border-color 0.15s',
  fontFamily: 'var(--font-sans)',
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, style, ...props }, ref) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && (
        <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)' }}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        style={{
          ...inputStyle,
          borderColor: error ? '#dc2626' : 'var(--color-border)',
          ...style,
        }}
        {...props}
      />
      {error && <span style={{ fontSize: '12px', color: '#dc2626' }}>{error}</span>}
    </div>
  )
)
Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, style, ...props }, ref) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && (
        <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)' }}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        style={{
          ...inputStyle,
          resize: 'vertical',
          minHeight: '80px',
          borderColor: error ? '#dc2626' : 'var(--color-border)',
          ...style,
        }}
        {...props}
      />
      {error && <span style={{ fontSize: '12px', color: '#dc2626' }}>{error}</span>}
    </div>
  )
)
Textarea.displayName = 'Textarea'
