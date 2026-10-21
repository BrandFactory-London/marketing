"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { DraftBody } from "@/components/DraftBody";
import { MarkdownEditor, type Mark, type MarkdownEditorHandle } from "@/components/MarkdownEditor";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, TextAreaField } from "@/components/ui/Field";
import { REVIEW_LINES } from "@/config/post-status";
import { EXCERPT_MAX, findPlaceholders, runChecks, type CheckInput } from "@/lib/checks";
import { approvalState, composeMarkdown, sameText, type PostText } from "@/lib/review-rules";
import type { CriticIssue, CriticPlaceholder } from "@/db/schema";
import type { ReviewActionResult, TextInput } from "./actions";

type Props = {
  postId: string;
  // Identifies the text this page opened with, so a copy kept in the browser is only offered against it.
  baseKey: string;
  initial: PostText;
  checkInput: Omit<CheckInput, "markdown">;
  siteUrl: string;
  issues: CriticIssue[];
  asks: CriticPlaceholder[];
  criticLabel: string | null;
  saveAction: (postId: string, input: TextInput) => Promise<ReviewActionResult>;
  approveAction: (postId: string, input: TextInput) => Promise<ReviewActionResult>;
  rejectAction: (postId: string, note: string) => Promise<ReviewActionResult>;
  regenerateAction: (postId: string, note: string, input: TextInput | null) => Promise<ReviewActionResult>;
  aside: ReactNode;
};

const storageKey = (postId: string, baseKey: string) => `bfm-review:${postId}:${baseKey}`;

function readStoredRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseStored(raw: string | null): PostText | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PostText;
  } catch {
    return null;
  }
}

const noSubscription = () => () => {};

function writeStored(key: string, text: PostText | null) {
  try {
    if (text) window.localStorage.setItem(key, JSON.stringify(text));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private windows); the page works without it.
  }
}

// Review a post (design decision 17, γ5 orientation Q1, Q2): edit the title, excerpt and Markdown body beside a
// live preview, with placeholders and the critic's quotes marked, the checks run live, and Approve blocked while
// placeholders, dashes or banned phrases remain. The server checks again on save and approve.
export function ReviewEditor(props: Props) {
  const { postId, baseKey, initial, checkInput, siteUrl, issues, asks } = props;
  const key = storageKey(postId, baseKey);
  const [saved, setSaved] = useState<PostText>(initial);
  const [text, setText] = useState<PostText>(initial);
  const [offerDismissed, setOfferDismissed] = useState(false);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [open, setOpen] = useState<"reject" | "regenerate" | null>(null);
  const [pending, startTransition] = useTransition();
  const editor = useRef<MarkdownEditorHandle>(null);
  const dirty = !sameText(text, saved);

  // A copy kept in this browser from an earlier visit is offered back, if it differs from the saved text.
  const stored = parseStored(useSyncExternalStore(noSubscription, () => readStoredRaw(key), () => null));
  const offer = !offerDismissed && stored !== null && !sameText(stored, initial) && !sameText(stored, text) ? stored : null;

  // Unsaved text is kept in this browser as Amir types. Nothing is written on load, so an earlier copy survives
  // until he restores or discards it; it is cleared when the text is saved, approved or typed back to the saved one.
  useEffect(() => {
    if (text === initial) return;
    writeStored(key, dirty ? text : null);
  }, [key, text, dirty, initial]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const deferred = useDeferredValue(text);
  const markdown = useMemo(() => composeMarkdown(deferred), [deferred]);
  const checks = useMemo(() => runChecks({ ...checkInput, markdown }), [checkInput, markdown]);
  const approval = useMemo(() => approvalState(markdown, checks), [markdown, checks]);

  // Positions come from the live text, never the deferred copy, so a click always selects what is on screen.
  const bodyPlaceholders = useMemo(() => findPlaceholders(text.body), [text.body]);
  const issueSpots = useMemo(() => issues.map((issue) => ({ issue, index: issue.quote ? text.body.indexOf(issue.quote) : -1 })), [issues, text.body]);
  const marks = useMemo<Mark[]>(() => {
    const list: Mark[] = bodyPlaceholders.map((item) => ({ from: item.index, to: item.index + item.text.length, kind: "placeholder" }));
    for (const spot of issueSpots) {
      if (spot.index >= 0) list.push({ from: spot.index, to: spot.index + spot.issue.quote.length, kind: "issue" });
    }
    for (const match of text.body.matchAll(/[\u2013\u2014]/g)) list.push({ from: match.index ?? 0, to: (match.index ?? 0) + 1, kind: "blocking" });
    return list;
  }, [bodyPlaceholders, issueSpots, text.body]);

  // Each placeholder in the title, excerpt and body, in that order, with the critic's ask for it when it gave one.
  const placeholderList = useMemo(() => {
    const unused = [...asks];
    const found = [
      ...findPlaceholders(text.title).map((item) => ({ text: item.text, where: "title" as const, bodyIndex: null })),
      ...findPlaceholders(text.excerpt).map((item) => ({ text: item.text, where: "excerpt" as const, bodyIndex: null })),
      ...bodyPlaceholders.map((item) => ({ text: item.text, where: "body" as const, bodyIndex: item.index })),
    ];
    return found.map((item) => {
      const at = unused.findIndex((ask) => ask.quote === item.text);
      return { ...item, ask: at >= 0 ? unused.splice(at, 1)[0].ask : null };
    });
  }, [asks, text.title, text.excerpt, bodyPlaceholders]);

  const select = useCallback(
    (from: number, to: number) => {
      if (pane === "edit") {
        editor.current?.select(from, to);
        return;
      }
      // On a phone the editor is behind the Preview tab; select once it shows.
      setPane("edit");
      requestAnimationFrame(() => editor.current?.select(from, to));
    },
    [pane],
  );

  const run = (action: () => Promise<ReviewActionResult>, after?: (result: ReviewActionResult) => void) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? (result.message ? { tone: "success", text: result.message } : null) : { tone: "danger", text: result.message });
      after?.(result);
    });
  };

  const save = () =>
    run(
      () => props.saveAction(postId, text),
      (result) => {
        if (result.ok) {
          setSaved(text);
          writeStored(key, null);
        }
      },
    );
  const approve = () =>
    run(
      () => props.approveAction(postId, text),
      (result) => {
        if (result.ok) writeStored(key, null);
      },
    );
  const discard = () => {
    writeStored(key, null);
    setOfferDismissed(true);
  };

  const excerptLength = text.excerpt.trim().length;
  const blockingCount = approval.placeholders.length + approval.blocking.length;

  return (
    <div className="app-draft-layout app-review-layout">
      <article className="bfm-card app-draft app-review" aria-label="Post text">
        {offer ? (
          <div className="app-callout app-callout-warning small" role="status">
            This browser kept unsaved changes from an earlier visit.{" "}
            <button type="button" className="app-link-button" onClick={() => setText(offer)}>
              Restore them
            </button>{" "}
            or{" "}
            <button type="button" className="app-link-button" onClick={discard}>
              discard them
            </button>
            .
          </div>
        ) : null}
        <div className="app-title-input">
          <Field label="Title" value={text.title} onChange={(event) => setText({ ...text, title: event.target.value })} />
        </div>
        <TextAreaField
          label="Excerpt"
          value={text.excerpt}
          onChange={(event) => setText({ ...text, excerpt: event.target.value })}
          help={`${excerptLength} of ${EXCERPT_MAX} characters. Becomes the page's meta description.`}
          error={excerptLength > EXCERPT_MAX ? `${excerptLength} characters; the limit is ${EXCERPT_MAX}.` : undefined}
          rows={2}
        />
        <div className="app-review-body">
          <div className="app-card-head">
            <p className="label app-muted" style={{ margin: 0 }}>
              Body · {checks.wordCount.toLocaleString("en-GB")} words · {checkInput.lengthMin.toLocaleString("en-GB")} to {checkInput.lengthMax.toLocaleString("en-GB")}
            </p>
            <div className="app-pane-tabs" role="tablist" aria-label="Body view">
              {(["edit", "preview"] as const).map((name) => (
                <button key={name} type="button" role="tab" aria-selected={pane === name} className={`bfm-btn bfm-btn-sm ${pane === name ? "bfm-btn-secondary" : "bfm-btn-ghost"}`} onClick={() => setPane(name)}>
                  {name === "edit" ? "Edit" : "Preview"}
                </button>
              ))}
            </div>
          </div>
          <div className="app-split" data-pane={pane}>
            <div className="app-split-edit">
              <MarkdownEditor ref={editor} label="Post body" value={text.body} onChange={(body) => setText((current) => ({ ...current, body }))} marks={marks} />
            </div>
            <div className="app-split-preview" aria-label="Preview">
              <DraftBody markdown={deferred.body} siteUrl={siteUrl} />
            </div>
          </div>
        </div>

        <div className="app-review-actions">
          <div className="app-review-buttons">
            <Button variant="secondary" onClick={save} disabled={pending || !dirty}>
              Save draft
            </Button>
            <Button variant="danger" onClick={() => setOpen(open === "reject" ? null : "reject")} disabled={pending} aria-expanded={open === "reject"}>
              Reject post
            </Button>
            <Button variant="secondary" onClick={() => setOpen(open === "regenerate" ? null : "regenerate")} disabled={pending} aria-expanded={open === "regenerate"}>
              Regenerate with a note
            </Button>
            <Button onClick={approve} disabled={pending || !approval.canApprove} aria-describedby="approve-reason">
              Approve post
            </Button>
          </div>
          <p id="approve-reason" className={`small ${approval.canApprove ? "app-muted" : "app-text-warning"}`} style={{ margin: 0 }}>
            {approval.reason ?? (dirty ? "Approving saves your changes first." : "Ready to approve.")}
          </p>
          {open === "reject" ? (
            <NoteForm
              label="Why are you rejecting it?"
              help="Kept with the post. The slot shows Rejected on the calendar."
              submit="Reject post"
              variant="danger"
              pending={pending}
              onCancel={() => setOpen(null)}
              onSubmit={(note) => run(() => props.rejectAction(postId, note))}
            />
          ) : null}
          {open === "regenerate" ? (
            <NoteForm
              label="What should the writer change?"
              help={`The writer starts from the text above${dirty ? ", which is saved first" : ""}, keeps your edits, then the checks and the critic run again. About $0.15 to $0.70.`}
              submit="Regenerate post"
              variant="primary"
              pending={pending}
              onCancel={() => setOpen(null)}
              onSubmit={(note) =>
                run(
                  () => props.regenerateAction(postId, note, text),
                  (result) => {
                    if (result.ok) writeStored(key, null);
                  },
                )
              }
            />
          ) : null}
          {message ? (
            <p className={`small ${message.tone === "danger" ? "app-form-error" : "app-text-success"}`} role={message.tone === "danger" ? "alert" : "status"} style={{ margin: 0 }}>
              {message.text}
            </p>
          ) : null}
        </div>
      </article>

      <aside className="app-review-notes" aria-label="Review notes">
        <section className="bfm-card app-stack" aria-labelledby="input-heading">
          <div className="app-card-head">
            <h2 id="input-heading" className="subheading" style={{ margin: 0 }}>
              {blockingCount > 0 ? REVIEW_LINES.needsInput.label : "Nothing to fill in"}
            </h2>
            {blockingCount > 0 ? <Badge tone={REVIEW_LINES.needsInput.tone}>{blockingCount} to fix</Badge> : <Badge tone="success">Clear</Badge>}
          </div>
          {placeholderList.length > 0 ? (
            <ul className="app-plain-list small">
              {placeholderList.map((item, index) => (
                <li key={`${item.where}-${index}`}>
                  {item.bodyIndex !== null ? (
                    <button type="button" className="app-link-button" onClick={() => select(item.bodyIndex!, item.bodyIndex! + item.text.length)}>
                      <mark className="app-placeholder">{item.text}</mark>
                    </button>
                  ) : (
                    <>
                      <mark className="app-placeholder">{item.text}</mark> <span className="app-muted">in the {item.where}</span>
                    </>
                  )}
                  {item.ask ? <span className="app-quote">{item.ask}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {approval.blocking.length > 0 ? (
            <ul className="app-plain-list small">
              {approval.blocking.map((issue, index) => (
                <li key={index}>
                  <Badge tone="danger">Blocks approval</Badge> {issue.message}
                  {issue.quote ? <q className="app-quote">{issue.quote}</q> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {blockingCount === 0 ? (
            <p className="small app-muted" style={{ margin: 0 }}>
              No placeholders, dashes or banned phrases left.
            </p>
          ) : null}
        </section>

        <section className="bfm-card app-stack" aria-labelledby="checks-heading">
          <div className="app-card-head">
            <h2 id="checks-heading" className="subheading" style={{ margin: 0 }}>
              Scripted checks
            </h2>
            <Badge tone={approval.warnings.length === 0 ? "success" : "warning"}>{approval.warnings.length === 0 ? "Passed" : `${approval.warnings.length} to look at`}</Badge>
          </div>
          {approval.warnings.length > 0 ? (
            <ul className="app-plain-list small">
              {approval.warnings.map((issue, index) => (
                <li key={index}>
                  {issue.message}
                  {issue.quote ? <q className="app-quote">{issue.quote}</q> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small app-muted" style={{ margin: 0 }}>
              {checks.wordCount.toLocaleString("en-GB")} words, links on the allowed list, excerpt within {EXCERPT_MAX} characters, nothing copied from the Examples.
            </p>
          )}
          {checks.info.lengthNote ? (
            <p className="small app-muted" style={{ margin: 0 }}>
              {checks.info.lengthNote}
            </p>
          ) : null}
          <p className="small app-muted" style={{ margin: 0 }}>
            These run as you type. Only placeholders, dashes and banned phrases block approval.
          </p>
        </section>

        {issues.length > 0 ? (
          <section className="bfm-card app-stack" aria-labelledby="critic-heading">
            <div className="app-card-head">
              <h2 id="critic-heading" className="subheading" style={{ margin: 0 }}>
                Critic notes
              </h2>
              {props.criticLabel ? <span className="small app-muted">{props.criticLabel}</span> : null}
            </div>
            <ul className="app-plain-list small">
              {issueSpots
                .filter((spot) => spot.index >= 0)
                .map(({ issue, index }, at) => (
                  <li key={`found-${at}`}>
                    <Badge tone={issue.severity === "blocking" ? "danger" : "neutral"}>{issue.severity === "blocking" ? "Blocking" : "Minor"}</Badge> [{issue.category}] {issue.note}
                    <button type="button" className="app-link-button app-quote" onClick={() => select(index, index + issue.quote.length)}>
                      {issue.quote}
                    </button>
                  </li>
                ))}
            </ul>
            {issueSpots.some((spot) => spot.index < 0) ? (
              <>
                <p className="label app-muted" style={{ margin: 0 }}>
                  Changed since the critic read it
                </p>
                <ul className="app-plain-list small app-muted">
                  {issueSpots
                    .filter((spot) => spot.index < 0)
                    .map(({ issue }, at) => (
                      <li key={`gone-${at}`}>
                        [{issue.category}] {issue.note}
                        <q className="app-quote">{issue.quote}</q>
                      </li>
                    ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}

        {props.aside}
      </aside>
    </div>
  );
}

function NoteForm({
  label,
  help,
  submit,
  variant,
  pending,
  onCancel,
  onSubmit,
}: {
  label: string;
  help: string;
  submit: string;
  variant: "primary" | "danger";
  pending: boolean;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="app-stack app-inline-form">
      <TextAreaField label={label} value={note} onChange={(event) => setNote(event.target.value)} rows={3} help={help} />
      <div className="app-review-buttons">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={variant} onClick={() => onSubmit(note)} disabled={pending || !note.trim()}>
          {submit}
        </Button>
      </div>
    </div>
  );
}
