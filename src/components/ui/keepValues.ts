"use client";

import { startTransition, type FormEvent } from "react";

// React resets a form after its action runs, and a reset puts selects back to the value they had when the
// form first rendered. That would silently undo a choice after a validation error or a save. Submitting
// through this handler runs the same action without the reset; `action={formAction}` stays on the form so
// it still works before JavaScript loads.
export function keepValuesOnSubmit(action: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(formData));
  };
}
