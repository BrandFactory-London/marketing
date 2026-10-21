"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { moveSlotAction, setTopicAction, type SlotActionState } from "@/app/(app)/_actions/slots";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { keepValuesOnSubmit } from "@/components/ui/keepValues";

type Props = {
  slot: { id: string; topic: string | null; slotDate: string };
  today: string;
  canChangeTopic: boolean;
  // On the calendar, a slot moved to another month is followed there, still selected.
  calendar?: { project?: string };
};

// Set or change a slot's topic and move its date (γ3 orientation Q5, Q7, Q9). Used by the calendar panel
// and the Run plan tab.
export function SlotEditor({ slot, today, canChangeTopic, calendar }: Props) {
  const router = useRouter();
  const [topicState, topicAction, topicPending] = useActionState(setTopicAction.bind(null, slot.id), {} as SlotActionState);
  const [moveState, moveAction, movePending] = useActionState(moveSlotAction.bind(null, slot.id), {} as SlotActionState);

  useEffect(() => {
    if (!calendar || !moveState.movedTo) return;
    const params = new URLSearchParams({ month: moveState.movedTo.slice(0, 7), slot: slot.id });
    if (calendar.project) params.set("project", calendar.project);
    router.replace(`/calendar?${params}`, { scroll: false });
  }, [calendar, moveState.movedTo, router, slot.id]);

  return (
    <div className="app-stack">
      {canChangeTopic ? (
        <form action={topicAction} onSubmit={keepValuesOnSubmit(topicAction)} className="app-form" noValidate>
          <Field
            label="Topic"
            name="topic"
            defaultValue={topicState.value ?? slot.topic ?? ""}
            maxLength={200}
            placeholder="e.g. Wet room or shower tray"
            help={slot.topic ? "Clear the topic to put the slot back to planned." : "The keyword and outline come with the spec."}
            error={topicState.error}
          />
          <div className="app-form-actions">
            {topicState.saved && !topicPending ? (
              <span className="small app-saved" role="status">
                Topic saved
              </span>
            ) : null}
            <Button type="submit" size="sm" disabled={topicPending}>
              {topicPending ? "Saving" : slot.topic ? "Change topic" : "Set topic"}
            </Button>
          </div>
        </form>
      ) : null}
      <form action={moveAction} onSubmit={keepValuesOnSubmit(moveAction)} className="app-form" noValidate>
        <Field label="Date" name="slotDate" type="date" min={today} defaultValue={moveState.value ?? slot.slotDate} error={moveState.error} />
        <div className="app-form-actions">
          {moveState.saved && !movePending ? (
            <span className="small app-saved" role="status">
              Slot moved
            </span>
          ) : null}
          <Button type="submit" size="sm" variant="secondary" disabled={movePending}>
            {movePending ? "Moving" : "Move slot"}
          </Button>
        </div>
      </form>
    </div>
  );
}
