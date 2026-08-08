import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

type CardProps = {
  children: ReactNode;
  padded?: boolean;
} & HTMLAttributes<HTMLElement>;

export function Card({
  children,
  className,
  padded = true,
  ...props
}: CardProps) {
  const cardClassName = [styles.card, padded && styles.padded, className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={cardClassName} {...props}>
      {children}
    </section>
  );
}
