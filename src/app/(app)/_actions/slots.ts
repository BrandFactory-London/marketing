"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/session";
import { moveSlot, setTopic, SlotError } from "@/lib/slots";
import { syncCalendarAfter } from "@/lib/calendar-hooks";

export type SlotActionState = { error?: string; saved?: "topic" | "moved"; movedTo?: string; value?: string };

export async function setTopicAction(slotId: string, _previous: SlotActionState, formData: FormData): Promise<SlotActionState> {
  await requireUser();
  // The calendar follows once the response has gone (γ8 orientation Q2).
  syncCalendarAfter("action");
  const value = String(formData.get("topic") ?? "");
  try {
    await setTopic(slotId, value);
  } catch (error) {
    if (error instanceof SlotError) return { error: error.message, value };
    throw error;
  }
  refresh();
  return { saved: "topic" };
}

export async function moveSlotAction(slotId: string, _previous: SlotActionState, formData: FormData): Promise<SlotActionState> {
  await requireUser();
  syncCalendarAfter("action");
  const value = String(formData.get("slotDate") ?? "");
  try {
    const slot = await moveSlot(slotId, value);
    refresh();
    return { saved: "moved", movedTo: slot.slotDate };
  } catch (error) {
    if (error instanceof SlotError) return { error: error.message, value };
    throw error;
  }
}
