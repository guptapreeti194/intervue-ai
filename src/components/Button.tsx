import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Variant = 'primary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

type CommonProps = {
  variant?: Variant
  size?: Size
  children: ReactNode
  className?: string
}

type ButtonAsLink = CommonProps & {
  to: string
  onClick?: () => void
}

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    to?: undefined
  }

type ButtonProps = ButtonAsLink | ButtonAsButton

export default function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', children, className = '' } = props
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (props.to !== undefined) {
    return (
      <Link to={props.to} className={classes} onClick={props.onClick}>
        {children}
      </Link>
    )
  }

  const {
    variant: _variant,
    size: _size,
    children: _children,
    className: _className,
    to: _to,
    ...rest
  } = props
  void _variant
  void _size
  void _children
  void _className
  void _to

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  )
}