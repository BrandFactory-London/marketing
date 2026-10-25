"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Field, TextAreaField } from "@/components/ui/Field";
import type { ClientFormState } from "./actions";

type Action = (state: ClientFormState, formData: FormData) => Promise<ClientFormState>;

const NAME_KEY = "bfm-plan-name";

function storedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    // Storage can be unavailable; the field simply starts empty.
    return "";
  }
}

const noSubscription = () => () => {};

// The name is kept for the next visit in this browser only (orientation Q6).
function useRememberedName(): [string, (value: string) => void] {
  const stored = useSyncExternalStore(noSubscription, storedName, () => "");
  const [typed, setTyped] = useState<string | null>(null);
  const update = (value: string) => {
    setTyped(value);
    try {
      window.localStorage.setItem(NAME_KEY, value);
    } catch {
      // Not kept, which is fine.
    }
  };
  return [typed ?? stored, update];
}

// A field nobody sees. Anything typed in it marks the submission as automated.
function Honeypot() {
  return (
    <div className="app-honeypot" aria-hidden="true">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

export function ItemFeedback({ action, title }: { action: Action; title: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [name, setName] = useRememberedName();
  const [open, setOpen] = useState(false);
  if (state.sent && !open) {
    return (
      <p className="small app-saved" role="status">
        Thank you. Your {state.sent === "suggest" ? "suggestion" : "comment"} has been sent to BrandFactory London.
      </p>
    );
  }
  return (
    <details className="app-plan-client-form" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary className="small">
        Comment or suggest a change<span className="app-visually-hidden"> on {title}</span>
      </summary>
      <form action={formAction} className="app-form" onSubmit={() => setOpen(false)}>
        <Honeypot />
        <TextAreaField label="Your comment or suggestion" name="body" rows={3} maxLength={2000} required />
        <Field label="Your name" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
        {state.error ? (
          <p className="small app-form-error" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="app-form-actions">
          <Button type="submit" name="kind" value="comment" variant="secondary" size="sm" disabled={pending}>
            Send comment
          </Button>
          <Button type="submit" name="kind" value="suggest" size="sm" disabled={pending}>
            Suggest a change
          </Button>
        </div>
      </form>
    </details>
  );
}

export function ApprovePlan({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [name, setName] = useRememberedName();
  if (state.sent === "approve") {
    return (
      <p className="body app-saved" role="status">
        Thank you. Your approval has been sent to BrandFactory London.
      </p>
    );
  }
  return (
    <form action={formAction} className="app-form" aria-label="Approve the plan">
      <Honeypot />
      <input type="hidden" name="kind" value="approve" />
      <Field label="Your name" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
      {state.error ? (
        <p className="small app-form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="app-form-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending" : "Approve plan"}
        </Button>
      </div>
    </form>
  );
}
