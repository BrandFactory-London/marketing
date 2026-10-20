import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

// Colour never stands alone: every badge carries its word (design/system/README.md).
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`bfm-badge bfm-badge-${tone}`}>{children}</span>;
}
