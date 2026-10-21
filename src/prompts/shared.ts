// Pieces the spec, writer and critic prompts share, so the three never drift apart.

// Decision 12, first fix: the two rhythm patterns every model-test writer used, named so the model can see them.
export const RHYTHM_PATTERNS = [
  '"your X, your Y and your Z" (for example "we will look at your room, your plans and your budget")',
  '"more X, more Y, more Z" (for example "more tiling, more materials and more labour hours")',
];

// Decision 12, second fix.
export const NO_INVENTED_PRACTICE =
  "Never describe a process, policy, habit or customer pattern of the client that the knowledge pack does not state. " +
  'That includes what the client "usually" does, what its customers "often" do, and how it quotes, checks or decides.';

export type PostBrief = {
  topic: string;
  lengthMin: number;
  lengthMax: number;
  cta: string;
  pillar: string | null;
  notes: string | null;
};

export type SpecForPrompt = PostBrief & {
  keyword: string;
  postType: string;
  location: string | null;
  angle: string;
  outline: readonly string[];
  facts: readonly string[];
  links: readonly string[];
  faq: boolean;
};

export function list(items: readonly string[], empty = "None."): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : empty;
}

// The confirmed spec as the writer and the critic read it.
export function specText(spec: SpecForPrompt): string {
  return [
    `Topic: ${spec.topic}`,
    `Primary keyword: ${spec.keyword}`,
    `Post type: ${spec.postType}`,
    `Location focus: ${spec.location ?? "None"}`,
    `Length: ${spec.lengthMin} to ${spec.lengthMax} words`,
    `FAQ section: ${spec.faq ? "yes, 3 to 5 questions" : "no"}`,
    `Call to action: ${spec.cta}`,
    `Pillar: ${spec.pillar ?? "None"}`,
    `Angle and opening: ${spec.angle}`,
    `Outline (H2 headings, in order):\n${list(spec.outline)}`,
    `Facts from the knowledge pack to use:\n${list(spec.facts)}`,
    `Internal links to use:\n${list(spec.links)}`,
    `Notes from Amir: ${spec.notes ?? "None"}`,
  ].join("\n");
}
