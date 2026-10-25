"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import type { PlanActionState } from "./plan-actions";

type FormAction = (state: PlanActionState, formData: FormData) => Promise<PlanActionState>;

function Outcome({ state }: { state: PlanActionState }) {
  if (state.error) {
    return (
      <p className="small app-form-error" role="alert">
        {state.error}
      </p>
    );
  }
  return state.message ? (
    <p className="small app-saved" role="status">
      {state.message}
    </p>
  ) : null;
}

// "Plan the run", or "Regenerate the whole plan" with a note.
export function PlanRunForm({ action, again }: { action: FormAction; again: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="app-form" aria-label={again ? "Regenerate the whole plan" : "Plan the run"}>
      {again ? (
        <TextAreaField
          label="What should change (optional)"
          name="note"
          rows={2}
          maxLength={2000}
          help="The planner redoes every slot with your note. Your note also feeds the suggestions in Settings."
        />
      ) : null}
      <Outcome state={state} />
      <div className="app-form-actions">
        <Button type="submit" variant={again ? "secondary" : "primary"} disabled={pending}>
          {pending ? "Starting" : again ? "Regenerate the whole plan" : "Plan the run"}
        </Button>
      </div>
    </form>
  );
}

// Regenerate one planned post, with a note.
export function RegenerateItem({ action, title }: { action: FormAction; title: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <details className="app-plan-edit">
      <summary className="small">
        Regenerate post<span className="app-visually-hidden">, {title}</span>
      </summary>
      <form action={formAction} className="app-form">
        <TextAreaField label="What should change (optional)" name="note" rows={2} maxLength={2000} />
        <Outcome state={state} />
        <div className="app-form-actions">
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? "Starting" : "Regenerate post"}
          </Button>
        </div>
      </form>
    </details>
  );
}

export function PlanButton({ action, label, pendingLabel, variant = "primary", confirm }: { action: () => Promise<PlanActionState>; label: string; pendingLabel: string; variant?: "primary" | "secondary"; confirm?: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<PlanActionState>({});
  return (
    <div className="app-stack" style={{ gap: 4 }}>
      <Button
        variant={variant}
        size="sm"
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setState(await action()));
        }}
      >
        {pending ? pendingLabel : label}
      </Button>
      <Outcome state={state} />
    </div>
  );
}

// Share with the client: the link is shown once, in a box to copy (orientation Q6).
export function ShareControls({ share, revoke, live }: { share: (origin: string) => Promise<PlanActionState>; revoke: () => Promise<PlanActionState>; live: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<PlanActionState>({});
  const [copied, setCopied] = useState(false);
  return (
    <div className="app-stack" style={{ gap: 6 }}>
      <div className="app-run-actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (live && !window.confirm("Make a new link? The link you sent before stops working.")) return;
            setCopied(false);
            start(async () => setState(await share(window.location.origin)));
          }}
        >
          {live ? "Make a new link" : "Share with the client"}
        </Button>
        {live ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => setState(await revoke()))}>
            Turn off link
          </Button>
        ) : null}
      </div>
      {state.link ? (
        <div className="app-share-link">
          <input className="bfm-input" readOnly value={state.link} aria-label="Link for the client" onFocus={(event) => event.target.select()} />
          <Button
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          <p className="small app-muted" style={{ margin: 0 }}>
            Shown once. It works for 60 days, until you turn it off or make a new one.
          </p>
        </div>
      ) : null}
      {state.error ? (
        <p className="small app-form-error" role="alert">
          {state.error}
        </p>
      ) : state.message ? (
        <p className="small app-saved" role="status">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

// While a plan is drafting, the tab looks again every few seconds.
export function RefreshWhileDrafting({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
