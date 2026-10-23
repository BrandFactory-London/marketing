"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import type { CalendarActionResult } from "./actions";

type Props = {
  calendars: { id: string; name: string }[];
  chosenId: string | null;
  chooseAction: (calendarId: string) => Promise<CalendarActionResult>;
  syncAction: () => Promise<CalendarActionResult>;
};

// Choose the calendar, and Sync calendar now (γ8 handoff items 2 and 6). A resync with more to do than one pass
// carries on by itself until nothing remains.
export function CalendarControls({ calendars, chosenId, chooseAction, syncAction }: Props) {
  const [selected, setSelected] = useState(chosenId ?? calendars[0]?.id ?? "");
  const [message, setMessage] = useState<CalendarActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const sync = () =>
    startTransition(async () => {
      // At most 20 passes of 100 changes, far more than the whole calendar holds.
      for (let pass = 1; pass <= 20; pass++) {
        const result = await syncAction();
        setMessage(result.remaining ? { ...result, message: `${result.message} Still syncing, ${result.remaining} to go.` } : result);
        if (!result.ok || !result.remaining) break;
      }
    });
  return (
    <div className="app-stack app-calendar-controls">
      <div className="app-review-buttons">
        <SelectField
          label="Calendar for every slot"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          options={calendars.map((item) => ({ value: item.id, label: item.name }))}
          help={chosenId && selected !== chosenId ? "Events already in the current calendar stay there." : undefined}
        />
        {selected !== chosenId ? (
          <Button variant="secondary" size="sm" disabled={pending || !selected} onClick={() => startTransition(async () => setMessage(await chooseAction(selected)))}>
            Use this calendar
          </Button>
        ) : null}
        {chosenId ? (
          <Button size="sm" disabled={pending} onClick={sync}>
            {pending ? "Syncing calendar" : "Sync calendar now"}
          </Button>
        ) : null}
      </div>
      {message ? (
        <p className={`small ${message.ok ? "app-muted" : "app-form-error"}`} role={message.ok ? "status" : "alert"} style={{ margin: 0 }}>
          {message.message}
        </p>
      ) : null}
    </div>
  );
}
