"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DERIVATIVE_LINES } from "@/config/post-status";
import { Field, TextAreaField } from "@/components/ui/Field";
import { checkDerivative, CHANNELS, type DerivativeChannel, type DerivativeIssue, type DerivativeText } from "@/lib/derivative-checks";
import type { DerivativeActionResult } from "./actions";

export type PanelVersion = {
  id: string;
  version: number;
  status: "writing" | "ready" | "failed";
  source: "model" | "edit";
  title: string | null;
  body: string | null;
  error: string | null;
  stale: boolean;
};

// The cover a pin suggests (γ7 orientation Q5): shown, never uploaded.
export type PanelCover = { src: string; name: string } | null;

type Props = {
  channel: DerivativeChannel;
  latest: PanelVersion | null;
  versions: number;
  postUrl: string;
  bannedPhrases: string[];
  cover?: PanelCover;
  generateAction: (note: string | null) => Promise<DerivativeActionResult>;
  saveAction: (text: DerivativeText) => Promise<DerivativeActionResult>;
  copyAction: (text: DerivativeText) => Promise<DerivativeActionResult>;
};

function IssueList({ issues }: { issues: DerivativeIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="app-plain-list small app-text-warning" aria-label="Checks to look at">
      {issues.map((issue, index) => (
        <li key={index}>
          {issue.field ? `${issue.field === "title" ? "Title" : "Description"}: ` : ""}
          {issue.message}
          {issue.quote ? <q className="app-quote">{issue.quote}</q> : null}
        </li>
      ))}
    </ul>
  );
}

// One channel's copy, as in the prototype's Publish screen: generate, edit, save as a version, copy (decision 20). A pin
// has a title and a description, each with its own Copy (γ7 orientation Q5).
export function DerivativePanel({ channel, latest, versions, postUrl, bannedPhrases, cover, generateAction, saveAction, copyAction }: Props) {
  const spec = CHANNELS[channel];
  const pin = channel === "pinterest";
  const savedBody = latest?.body ?? "";
  const savedTitle = latest?.title ?? "";
  const [text, setText] = useState(savedBody);
  const [title, setTitle] = useState(savedTitle);
  // The version shown: a new version, or the same one finishing its run, replaces the text in the box.
  const key = latest ? `${latest.id}:${latest.status}` : null;
  const [base, setBase] = useState(key);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<DerivativeActionResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (key !== base) {
    setBase(key);
    setText(latest?.body ?? "");
    setTitle(latest?.title ?? "");
  }
  const writing = latest?.status === "writing" && !latest.stale;
  const current: DerivativeText = pin ? { title, body: text } : { body: text };
  const checks = useMemo(
    () => (text || title ? checkDerivative(pin ? { title, body: text } : text, channel, { bannedPhrases, postUrl }) : null),
    [text, title, pin, channel, bannedPhrases, postUrl],
  );
  const dirty = text.trim() !== savedBody.trim() || (pin && title.trim() !== savedTitle.trim());
  // Once the channel has text, a regenerate says what was wrong with it (γ7 handoff item 1).
  const hasText = Boolean(latest?.body);
  const badge: { tone: "brand" | "danger" | "neutral" | "warning" | "success"; label: string } = writing
    ? DERIVATIVE_LINES.writing
    : latest?.status === "failed" || latest?.stale
      ? DERIVATIVE_LINES.notWritten
      : !latest
        ? DERIVATIVE_LINES.notGenerated
        : checks && !checks.passed
          ? { tone: "warning", label: `${checks.issues.length} to check` }
          : DERIVATIVE_LINES.ready;

  const run = (action: () => Promise<DerivativeActionResult>) =>
    startTransition(async () => {
      setCopied(null);
      const result = await action();
      setMessage(result.ok ? null : result);
    });
  const writeToClipboard = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      return true;
    } catch {
      setCopied(null);
      setMessage({ ok: false, message: "The browser did not allow copying. Select the text and copy it by hand." });
      return false;
    }
  };
  // Copy puts the text on the clipboard first, while the click still counts as the user's, then records the version:
  // unsaved changes are saved, and an edit is read for rules (γ7 orientation Q3).
  const copy = (value: string, what: string) =>
    startTransition(async () => {
      setMessage(null);
      if (!(await writeToClipboard(value, what))) return;
      const result = await copyAction(current);
      if (!result.ok) setMessage(result);
    });

  const characters = (count: number | undefined, max: number) => `${(count ?? 0).toLocaleString("en-GB")} of ${max.toLocaleString("en-GB")} characters`;
  const versionLine = `version ${latest?.version ?? 1} of ${versions}${latest?.source === "edit" ? ", your edit" : ""}`;

  return (
    <section className={`bfm-aurora app-derivative ${writing ? "bfm-aurora-active" : ""}`} aria-label={spec.label}>
      <div className="app-card-head">
        <p className="subheading" style={{ margin: 0 }}>
          {spec.label}
        </p>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      {writing ? (
        <div className="app-stack" role="status">
          <span className="bfm-shimmer small">Writing the {spec.label} from the approved post</span>
          <div className="bfm-skeleton" style={{ width: "92%" }} />
          <div className="bfm-skeleton" style={{ width: "78%" }} />
          <div className="bfm-skeleton" style={{ width: "60%" }} />
        </div>
      ) : latest?.body || dirty ? (
        <div className="app-stack">
          {pin ? (
            <>
              <Field label="Pin title" value={title} onChange={(event) => setTitle(event.target.value)} help={characters(checks?.titleCharacters, spec.title!.max)} />
              <div className="app-review-buttons">
                <Button size="sm" variant="secondary" disabled={pending || !title} onClick={() => copy(title, "title")}>
                  {copied === "title" ? "Title copied" : "Copy title"}
                </Button>
              </div>
            </>
          ) : null}
          <TextAreaField
            label={pin ? "Pin description" : `${spec.label} text`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={channel === "gmb" || pin ? 6 : 10}
            help={`${characters(checks?.characters, spec.max)} · ${versionLine}`}
          />
          {checks ? <IssueList issues={checks.issues} /> : null}
          {channel === "gmb" || channel === "facebook" || pin ? (
            <p className="small app-muted" style={{ margin: 0 }}>
              {channel === "gmb"
                ? `Add the post's link as the "Learn more" button: ${postUrl} `
                : pin
                  ? `The pin's destination link: ${postUrl} `
                  : `The post's link, if you add it as a comment: ${postUrl} `}
              <Button variant="ghost" size="sm" onClick={() => writeToClipboard(postUrl, "link")}>
                {copied === "link" ? "Link copied" : "Copy link"}
              </Button>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="small app-muted" style={{ margin: 0 }}>
          {latest?.status === "failed" || latest?.stale ? `The last run did not finish: ${latest.error ?? "it stopped reporting"}.` : "Not generated yet."}
        </p>
      )}
      {pin && !writing ? (
        cover ? (
          <figure className="app-pin-cover">
            {/* eslint-disable-next-line @next/next/no-img-element -- a private Drive thumbnail served by the app's own route */}
            <img src={cover.src} alt={`Suggested pin image: ${cover.name}`} />
            <figcaption className="small app-muted">
              Suggested image: the post&apos;s cover, {cover.name}. Pinterest suggests tall images (2:3). Upload this or a taller crop with the pin.
            </figcaption>
          </figure>
        ) : (
          <p className="small app-muted" style={{ margin: 0 }}>
            No cover chosen, so there is no suggested image. Pinterest suggests tall images (2:3).
          </p>
        )
      ) : null}
      {asking ? (
        <TextAreaField
          label="What was wrong with this version?"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          help="The writer fixes it in the new version. A rule or fact in it is proposed in Settings for you to accept."
        />
      ) : null}
      <div className="app-review-buttons">
        {hasText ? (
          asking ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button variant="secondary" size="sm" disabled={pending || !note.trim()} onClick={() => run(async () => (setAsking(false), setNote(""), generateAction(note.trim())))}>
                Regenerate {spec.label}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" disabled={pending || writing} onClick={() => setAsking(true)}>
              Regenerate
            </Button>
          )
        ) : (
          <Button variant="secondary" size="sm" disabled={pending || writing} onClick={() => run(() => generateAction(null))}>
            {latest ? "Try again" : `Generate ${spec.label}`}
          </Button>
        )}
        {dirty && !writing ? (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => saveAction(current))}>
            Save edit
          </Button>
        ) : null}
        {text && !writing ? (
          <Button size="sm" disabled={pending} onClick={() => copy(text, "text")}>
            {copied === "text" ? "Copied" : pin ? "Copy description" : "Copy"}
          </Button>
        ) : null}
      </div>
      {message && !message.ok ? (
        <p className="small app-form-error" role="alert" style={{ margin: 0 }}>
          {message.message}
        </p>
      ) : null}
    </section>
  );
}
