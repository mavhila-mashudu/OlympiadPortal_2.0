import type { SelectHTMLAttributes } from 'react'
import styles from './Select.module.css'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

export function Select({ children, className, ...props }: SelectProps) {
  const selectClassName = [styles.select, className].filter(Boolean).join(' ')

  return (
    <select className={selectClassName} {...props}>
      {children}
    </select>
  )
}
