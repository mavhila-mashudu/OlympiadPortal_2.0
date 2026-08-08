import type { InputHTMLAttributes } from 'react'
import styles from './FileInput.module.css'

type FileInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export function FileInput({ className, ...props }: FileInputProps) {
  const inputClassName = [styles.fileInput, className].filter(Boolean).join(' ')

  return <input className={inputClassName} type="file" {...props} />
}
