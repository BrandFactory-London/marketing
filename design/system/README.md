BrandFactory Marketing is an internal tool for turning client knowledge into approved content. The interface should feel light, calm and quick, with motion reserved for the moments where Claude is working.

## Content fundamentals

- Write in plain, direct British English. Short sentences, specific nouns, numbers with units.
- Never use em dashes. Use a comma, a full stop or a hyphen instead.
- Sentence case everywhere: buttons, headings, nav items, badges. "Generate batch", not "Generate Batch".
- Address the operator as "you". Refer to the AI by what it does ("Writing", "Checking"), not as a character.
- Buttons are verbs plus an object: "Approve post", "Confirm spec", "Publish to Wix". Avoid "Submit" and "OK".
- Status words are fixed and used only for these states: Planned, Topic set, Spec ready, Writing, Checking, Needs review, Approved, Published, Failed, Rejected. Writing and Checking are the two steps of generating. The app defines them once, in `src/config/post-status.ts`.
- No emoji in the interface.

## Colour

- Set every page on `surface-50`. Put cards, panels and inputs on `surface-0`. Use `surface-100` for hover rows, selected nav items and read-only fields.
- Set primary text in `ink` and secondary text in `ink-muted`. Both pass 4.5:1 on `surface-0`, `surface-50` and `surface-100`.
- `brand` is the only action colour: primary buttons, links, the focus ring and the active step. Text on `brand` is `on-brand`. Selected states use `brand-tint` with `brand-ink` text.
- Borders are `line` at rest. Use `line-strong` only where a border carries meaning, such as a hovered input.
- `aurora-cyan`, `aurora-sky` and `aurora-peach` are decorative. Use them only together, as the aurora glow or the progress fill, and only on surfaces where Claude is generating. Never set text in them.
- Status pairs: `success` on `success-tint`, `warning` on `warning-tint`, `danger` on `danger-tint`. Every status also carries its word; colour never stands alone.

## Type

- One family: Plus Jakarta Sans (Google Fonts), loaded by `components/bundle.css`.
- Use `title` once per screen for its name, `heading` for card and section headings, `subheading` for groups and list titles, `body` for all running text and inputs, `small` for metadata, `label` for field labels and badges. `display` is for empty states only.
- Weights are 400 for reading and 600 for anything the eye should land on. Avoid 700 outside the product name in the nav.

## Space, radius and depth

- Spacing steps are `space-1` to `space-12`. Cards pad at `space-6`; fields sit `space-4` apart; page sections sit `space-8` apart.
- Corners: `radius-md` for buttons, inputs and nav items, `radius-lg` for cards, `radius-xl` for modals and the AI panel, `radius-pill` for badges and toggles.
- Depth is soft and low. Cards use `shadow-card`; hovered cards, menus and modals use `shadow-raised`. Never stack more than two levels.
- Layouts breathe: a 240px sidebar, content up to 1200px wide, and generous white space rather than dividers.

## Motion

The interface is still by default and comes alive when Claude works. Three kinds of motion, each with a fixed use:

1. **State motion.** Hovers, presses and colour changes run at `duration-fast` with `ease-out`. Panels and step changes run at `duration-base`.
2. **Arrival motion.** When a batch of items appears (generated posts, crawled pages), each fades up 8px with `bfm-reveal`, staggered 60ms apart, over `duration-slow`.
3. **AI motion.** Only while Claude is generating or checking:
    - The panel holding the work gets the aurora glow (`bfm-aurora`, stronger with `bfm-aurora-active`), drifting over `duration-aurora`.
    - The live status line uses the shimmer sweep (`bfm-shimmer`) over `duration-shimmer`.
    - Content not yet written shows as `bfm-skeleton` lines.
    - Batch progress uses the aurora fill (`bfm-progress-bar`).

Stop all AI motion the moment the work finishes. Every looping animation is switched off under `prefers-reduced-motion`.

## States and focus

- Focus is a solid 2px `brand` outline offset by 2px, plus the `shadow-focus` halo. It reaches at least 3:1 on every surface.
- Disabled controls drop to 50% opacity and lose their hover.
- Errors put a `danger` border on the field and replace its help text with the error in `danger`.

## Iconography

No icon set ships with this system yet. Use one outline set at 20px with a 1.5px stroke, coloured `ink-muted`, or `brand-ink` when selected. Never use emoji or filled icons.
