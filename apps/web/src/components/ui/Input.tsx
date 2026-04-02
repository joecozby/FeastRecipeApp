import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react'

const baseInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: '15px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-input-bg)',
  color: 'var(--color-text)',
  outline: 'none',
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
  fontFamily: 'var(--font-sans)',
}

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--color-text)',
  fontFamily: 'var(--font-sans)',
  letterSpacing: '0.01em',
}

const errorStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--color-hard)',
  fontWeight: 500,
  fontFamily: 'var(--font-sans)',
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, style, ...props }, ref) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {label && <label style={labelStyle}>{label}</label>}
      <input
        ref={ref}
        style={{
          ...baseInputStyle,
          borderColor: error ? 'var(--color-hard)' : 'var(--color-border)',
          ...style,
        }}
        {...props}
      />
      {error && <span style={errorStyle}>{error}</span>}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {label && <label style={labelStyle}>{label}</label>}
      <textarea
        ref={ref}
        style={{
          ...baseInputStyle,
          resize: 'vertical',
          minHeight: '90px',
          borderColor: error ? 'var(--color-hard)' : 'var(--color-border)',
          ...style,
        }}
        {...props}
      />
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  )
)
Textarea.displayName = 'Textarea'
