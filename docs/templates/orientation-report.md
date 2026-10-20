# Template: Orientation Report

> Opens every implementation session. Reviewed and approved by Amir BEFORE any code is written.
> Adapt the headings to the session; keep all six sections.

## 1. Branch state

```
$ git branch --show-current
$ git log --oneline -3
$ git status
```

Confirm: correct branch, clean working tree, expected HEAD. Flag any branch decision needed.

## 2. Files in scope

Grouped by domain, one line per file on what changes. Note which checkpoint touches which files.

## 3. Open questions from the design conversation

Address each "deferred to implementation orientation" item with a concrete proposal (methodology D.2.4).

- **Q1, <topic>:** <proposal>. Needs confirmation.

## 4. Checkpoint structure

| Cp | Focus | Files | Risk |
|----|-------|-------|------|

## 5. Estimated LOC + test deltas

| Cp | LOC (est.) | New tests (est.) |
|----|-----------|------------------|

Estimates only. The verification gate cites the real numbers from the test runner (D.1.2).

## 6. Ambiguities to resolve before starting

If the first move isn't crystal clear, say so and stop.

---

**Stop after the orientation. Wait for go-ahead before writing code.**
