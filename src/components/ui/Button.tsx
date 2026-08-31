import clsx from "clsx";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

const variants: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
};

type BaseProps = {
  variant?: ButtonVariant;
  className?: string;
};

type ButtonProps = BaseProps &
  ComponentPropsWithoutRef<"button"> & { href?: never };

type LinkButtonProps = BaseProps &
  ComponentPropsWithoutRef<typeof Link> & { href: string };

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button className={clsx(variants[variant], className)} {...props} />
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  href,
  ...props
}: LinkButtonProps) {
  return (
    <Link href={href} className={clsx(variants[variant], className)} {...props} />
  );
}
