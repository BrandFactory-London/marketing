import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  interactive = false,
  className,
  ...rest
}: { interactive?: boolean } & HTMLAttributes<HTMLElement>) {
  const classes = ["bfm-card", interactive ? "bfm-card-interactive" : "", className].filter(Boolean).join(" ");
  return <section className={classes} {...rest} />;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <p className="bfm-card-title">{children}</p>;
}

export function CardMeta({ children }: { children: ReactNode }) {
  return <p className="bfm-card-meta">{children}</p>;
}
