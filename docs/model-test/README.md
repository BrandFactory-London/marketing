# Model test (20 Oct 2026)

Source of record: the Claude Docs doc "BrandFactory Marketing: model test". These files are the raw material, kept here for γ4 (generation) to build on.

## Result

Opus 5.5 is the default writer and critic. Both stay changeable in Settings and per batch.

## What ran

- Two Migss topics: "Wet room or shower tray: which suits your bathroom?" (1,800 to 2,500 words, with FAQ) and "How much does a bathroom renovation cost in Essex?" (700 to 900 words, no FAQ, lead with the price range).
- Opus 5.5, Sonnet 5.5 and Haiku 5.5 each wrote both posts from `knowledge-pack.md`.
- `check.py` ran scripted checks on every draft (word count, dashes, banned phrases, links outside the allowed list, excerpt length, FAQ rule). γ4 ports this to TypeScript.
- Drafts were relabelled D1 to D6 (`blind-map.json`) and each model critiqued all six (`critics/`).

Files:
- `knowledge-pack.md`: the three-tier pack and output format the writers used. A good seed for the first BrandFactory rules, Migss client knowledge and Migss project knowledge.
- `drafts/`: A = wet room post, B = cost post, one per model.
- `critics/`: each critic's report on the blind drafts.

## Prompt fixes to bake in (design decision 12)

- Ban "your X, your Y and your Z" and "more X, more Y, more Z" by name, especially in the CTA. Five of six drafts used one.
- Never describe a client process, policy or customer pattern the knowledge does not state. Opus and Sonnet both invented some.
- The critic treats spec items as hard checks: the opening the spec asks for, a headed CTA, and the /contact link.
