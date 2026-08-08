import type { CSSProperties, ReactNode } from 'react'
import { Card } from './Card'
import styles from './Table.module.css'

type TablePanelProps = {
  title?: string
  children: ReactNode
  minWidth?: string
}

type TableCellProps = {
  children: ReactNode
  numeric?: boolean
  strong?: boolean
  muted?: boolean
  className?: string
}

export function TablePanel({ title, children, minWidth = '52rem' }: TablePanelProps) {
  return (
    <Card className={styles.panel} padded={false}>
      {title ? (
        <div className={styles.header}>
          <h2>{title}</h2>
        </div>
      ) : null}
      <div className={styles.scroller}>
        <table className={styles.table} style={{ '--table-min-width': minWidth } as CSSProperties}>
          {children}
        </table>
      </div>
    </Card>
  )
}

export function Th({
  children,
  numeric = false,
  className,
}: Omit<TableCellProps, 'strong' | 'muted'>) {
  return (
    <th className={[numeric && styles.numeric, className].filter(Boolean).join(' ')}>
      {children}
    </th>
  )
}

export function Td({
  children,
  numeric = false,
  strong = false,
  muted = true,
  className,
}: TableCellProps) {
  return (
    <td
      className={[
        numeric && styles.numeric,
        strong && styles.strong,
        muted && styles.muted,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </td>
  )
}
