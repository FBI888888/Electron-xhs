import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  icon?: ReactNode
}

export const Button = ({
  variant = 'secondary',
  icon,
  children,
  className = '',
  ...props
}: ButtonProps) => (
  <button className={`button button--${variant} ${className}`} {...props}>
    {icon}
    <span>{children}</span>
  </button>
)