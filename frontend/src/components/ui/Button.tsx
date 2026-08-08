import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "icon";

type BaseButtonProps = {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  to?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  justify?: "center" | "start";
};

type ButtonProps = BaseButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">;

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Button({
  children,
  className,
  icon,
  to,
  variant = "primary",
  size = "default",
  fullWidth = false,
  justify = "center",
  type = "button",
  ...props
}: ButtonProps) {
  const buttonClassName = cx(
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    justify === "start" && styles.justifyStart,
    className,
  );

  if (to) {
    return (
      <Link className={buttonClassName} to={to}>
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <button className={buttonClassName} type={type} {...props}>
      {icon}
      {children}
    </button>
  );
}
