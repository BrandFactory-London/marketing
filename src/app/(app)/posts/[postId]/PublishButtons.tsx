"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { PublishActionResult } from "./actions";

// Publish post asks once before anything goes public (γ6 orientation, smaller decisions).
export function PublishButton({ action, blogName, label }: { action: () => Promise<PublishActionResult>; blogName: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<PublishActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="app-stack">
      {pending ? (
        <p className="small bfm-shimmer" role="status" style={{ margin: 0 }}>
          Publishing: uploading the cover, then creating and publishing the post on Wix. This takes up to a minute.
        </p>
      ) : confirming ? (
        <div className="app-review-buttons" role="group" aria-label="Confirm publishing">
          <span className="small">Publish to {blogName} now? It becomes public straight away.</span>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              startTransition(async () => {
                setConfirming(false);
                setResult(await action());
              })
            }
          >
            Publish now
          </Button>
        </div>
      ) : (
        <div className="app-review-buttons">
          <Button disabled={pending} onClick={() => (setResult(null), setConfirming(true))}>
            {label}
          </Button>
        </div>
      )}
      {result && !result.ok ? (
        <p className="small app-form-error" role="alert" style={{ margin: 0 }}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

export function CheckAgainButton({ action }: { action: () => Promise<PublishActionResult> }) {
  const [result, setResult] = useState<PublishActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="app-stack">
      <div className="app-review-buttons">
        <Button variant="secondary" disabled={pending} onClick={() => startTransition(async () => setResult(await action()))}>
          Check again
        </Button>
      </div>
      {result && !result.ok ? (
        <p className="small app-form-error" role="alert" style={{ margin: 0 }}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
