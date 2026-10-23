"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { DerivativeActionResult } from "./actions";

// Generate all (γ7 handoff item 8): one click writes every channel that has no version yet.
export function GenerateAllButton({ missing, total, action }: { missing: number; total: number; action: () => Promise<DerivativeActionResult> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="app-stack" style={{ alignItems: "flex-end", gap: 4 }}>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action();
            setError(result.ok ? null : result.message);
          })
        }
      >
        {missing === total ? "Generate all channels" : "Generate remaining channels"}
      </Button>
      <span className="small app-muted">About $0.10 to $0.30 for all four on Opus</span>
      {error ? (
        <p className="small app-form-error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
