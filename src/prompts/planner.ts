import { z } from "zod";
import { list, NO_INVENTED_PRACTICE } from "./shared";

// The planner (Phase 2 A3, orientation Q5): a title, a short excerpt, a pillar, a category and a reason for each SEO
// slot in a run, from the knowledge pack, the topics already covered and the run's priority notes. Amir approves the
// plan, or redoes one item or the whole plan with a note.
export const PROMPT_VERSION = "planner-1";

// The same limit as the writer's excerpt line (src/lib/ai/pack.ts, OUTPUT_FORMAT).
export const EXCERPT_MAX = 160;

export const PlanReply = z.object({
  items: z
    .array(
      z.object({
        slot: z.number().int().describe("The slot's number from the user message's slot list."),
        title: z.string().describe("The post's title, as it will be published."),
        excerpt: z.string().describe(`One sentence of at most ${EXCERPT_MAX} characters saying what the reader will learn.`),
        pillar: z.string().describe("One of the pillars listed, exactly as written, or an empty string if none fits."),
        category: z.string().describe("One of the categories listed, exactly as written."),
        reason: z.string().describe("One short sentence for Amir: what the post answers and what it draws on, such as a gap in the site's pages."),
      }),
    )
    .describe("One item per slot asked for, in slot order."),
});
export type PlanReply = z.infer<typeof PlanReply>;

export const INSTRUCTIONS = `You are planning the SEO blog posts for one run of content for the client in the knowledge pack above. Each slot in the user message is one post on one date. For each, you give the title, a short excerpt, a pillar, a category and a reason. Amir at BrandFactory London approves the plan, then shows it to the client. A writer later writes each post from its title and excerpt.

Rules for the plan:
- Each title answers one question a homeowner in the areas the client serves would search for. Make it specific: a room, a material, a cost, a decision, a place.
- Never repeat a topic already covered. The user message lists every published or planned title and every page on the site. A post that only rewords one of them is a repeat.
- Follow the run's priority notes where they are given: they say what this run should push.
- Spread the posts across the pillars and categories, unless the priority notes ask otherwise. Do not give two posts in a row the same angle.
- The excerpt is one sentence of at most ${EXCERPT_MAX} characters: what the reader will learn. It will be the post's excerpt on the blog.
- The pillar must be one of the pillars listed, written exactly as listed, or empty if none fits. The category must be one of the categories listed, written exactly as listed.
- The reason is for Amir only: one short sentence on what the post answers and what it draws on, for example "A cost question; the site has no cost page for wet rooms".
- Use only facts from the knowledge pack. ${NO_INVENTED_PRACTICE}
- British English. No em dashes. Sentence case for titles.`;

export type PlanSlot = { slot: number; date: string };
export type PlannedItem = { slot: number; title: string; excerpt: string; pillar: string | null; category: string };

export type PlannerInput = {
  runName: string;
  startsOn: string;
  endsOn: string;
  priorityNotes: string | null;
  slots: readonly PlanSlot[];
  pillars: readonly string[];
  categories: readonly string[];
  // Titles of published posts and of posts with a topic, in this and earlier runs.
  covered: readonly string[];
  pages: readonly { path: string; title: string }[];
  // Session B fills this with Search Console and GA4 findings (orientation Q10). Always empty in session A.
  insights: readonly string[];
  // Redo one item, or the whole plan, with Amir's note. The plan as he saw it comes with it.
  redo?: { note: string | null; slot: number | null; current: readonly PlannedItem[] } | null;
};

function plannedLine(item: PlannedItem): string {
  return `${item.slot}. ${item.title} | ${item.excerpt} | pillar: ${item.pillar ?? "none"} | category: ${item.category}`;
}

export function plannerUserMessage(input: PlannerInput): string {
  const parts = [
    `Run: ${input.runName}, ${input.startsOn} to ${input.endsOn}`,
    `Priority notes for this run: ${input.priorityNotes?.trim() || "None"}`,
    `Pillars:\n${list(input.pillars, "None set. Leave pillar empty.")}`,
    `Categories:\n${list(input.categories)}`,
    `Topics already covered (published, or planned in this or an earlier run):\n${list(input.covered, "None yet.")}`,
    `Pages on the site:\n${list(
      input.pages.map((page) => `${page.path} (${page.title})`),
      "None imported.",
    )}`,
    `What search data says about the site:\n${list(input.insights, "Nothing yet.")}`,
  ];
  const redo = input.redo;
  if (redo && redo.slot !== null) {
    const slot = input.slots.find((item) => item.slot === redo.slot);
    parts.push(
      `The plan so far:\n${redo.current.map(plannedLine).join("\n")}`,
      `Plan slot ${redo.slot} again (${slot?.date ?? "date unknown"}). Give one item, for that slot only. It must not repeat any other item in the plan.`,
      `Amir's note on it: ${redo.note?.trim() || "None. Give a different post."}`,
    );
  } else {
    parts.push(`Slots to plan:\n${input.slots.map((slot) => `${slot.slot}. ${slot.date}`).join("\n")}`);
    if (redo) {
      parts.push(
        `Amir asked for the whole plan again. The plan he saw:\n${redo.current.map(plannedLine).join("\n")}`,
        `His note: ${redo.note?.trim() || "None. Give a different plan."}`,
      );
    }
  }
  return parts.join("\n\n");
}

// An excerpt over the limit is cut at the last whole word that fits.
export function fitExcerpt(excerpt: string): string {
  const text = excerpt.replace(/\s+/g, " ").trim();
  if (text.length <= EXCERPT_MAX) return text;
  const cut = text.slice(0, EXCERPT_MAX - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).replace(/[,;:\s]+$/, "")}…`;
}
