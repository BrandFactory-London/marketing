# Template: Verification Gate

> Closes every checkpoint and every session. Everything here is literal output or an explicit
> statement. The "what was visually verified vs code-inspection only" section is mandatory (D.1.1).

## Git state

```
Branch: <branch> (pushed / not pushed)
HEAD:   <hash> <commit message>
Status: <clean working tree / details>
```

## LOC delta

`<files changed>: +<insertions> / -<deletions>`. Note if an estimate was overshot and why.

## Test count

Pasted verbatim from the test runner's own summary lines (D.1.2, never grep, never retyped):
```
Test Files <N> passed (<N>)
Tests <N> passed (<N>)
```
State the delta vs the previous checkpoint. Correct any earlier wrong count explicitly.

## Typecheck + lint

```
Typecheck: <result>
Lint: <clean / details>
```

## Migrations (if any)

Migration file, how it was applied, and the independent query that confirmed the effect (D.4.2, D.4.4).

## Consumer audit (D.3.3)

- **<changed thing>:** <N> consumers, <list + "verified clean" or details>

## What was verified vs code-inspection only (MANDATORY)

**Verified (how):**
- <thing>: <how>

**Code-inspection only (needs smoke):**
- <thing>: why it couldn't be verified here, and what Amir should check at smoke.

## Deliberately unchanged / out of scope

## Smoke instructions for Amir

Numbered, concrete checks with expected outcomes and "report back if X" conditions.

## What the next checkpoint picks up

---

**Stopping for smoke / review. Proceed to <next> on go-ahead.**
