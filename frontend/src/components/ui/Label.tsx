import type { LabelHTMLAttributes, ReactNode } from "react";
import styles from "./Label.module.css";

type LabelProps = {
  children: ReactNode;
} & LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ children, className, ...props }: LabelProps) {
  const labelClassName = [styles.label, className].filter(Boolean).join(" ");

  return (
    <label className={labelClassName} {...props}>
      {children}
    </label>
  );
}
