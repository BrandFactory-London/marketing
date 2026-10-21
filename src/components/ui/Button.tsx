import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type CommonProps = { variant?: Variant; size?: "md" | "sm"; children: ReactNode };

export function buttonClass(variant: Variant = "primary", size: "md" | "sm" = "md"): string {
  return ["bfm-btn", `bfm-btn-${variant}`, size === "sm" ? "bfm-btn-sm" : ""].filter(Boolean).join(" ");
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={[buttonClass(variant, size), className].filter(Boolean).join(" ")} {...rest} />;
}

export function ButtonLink({ variant, size, href, current, children }: CommonProps & { href: string; current?: boolean }) {
  return (
    <Link href={href} className={buttonClass(variant, size)} style={{ textDecoration: "none" }} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
