"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DERIVATIVE_LINES } from "@/config/post-status";
import { TextAreaField } from "@/components/ui/Field";
import { checkDerivative, CHANNELS, type DerivativeChannel } from "@/lib/derivative-checks";
import type { DerivativeActionResult } from "./actions";

export type PanelVersion = { id: string; version: number; status: "writing" | "ready" | "failed"; source: "model" | "edit"; body: string | null; error: string | null; stale: boolean };

type Props = {
  channel: DerivativeChannel;
  latest: PanelVersion | null;
  versions: number;
  postUrl: string;
  bannedPhrases: string[];
  generateAction: (note: string | null) => Promise<DerivativeActionResult>;
  saveAction: (body: string) => Promise<DerivativeActionResult>;
};

// One channel's copy, as in the prototype's Publish screen: generate, edit, save as a version, copy (decision 20).
export function DerivativePanel({ channel, latest, versions, postUrl, bannedPhrases, generateAction, saveAction }: Props) {
  const spec = CHANNELS[channel];
  const saved = latest?.body ?? "";
  const [text, setText] = useState(saved);
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
  }
  const writing = latest?.status === "writing" && !latest.stale;
  const checks = useMemo(() => (text ? checkDerivative(text, channel, { bannedPhrases, postUrl }) : null), [text, channel, bannedPhrases, postUrl]);
  const dirty = text.trim() !== saved.trim();
  const badge: { tone: "brand" | "danger" | "neutral" | "warning" | "success"; label: string } = writing
    ? DERIVATIVE_LINES.writing
    : latest?.status === "failed" || latest?.stale
      ? DERIVATIVE_LINES.notWritten
      : !latest
        ? DERIVATIVE_LINES.notGenerated
        : checks && !checks.passed
          ? { tone: "warning", label: `${checks.issues.length} to check` }
          : DERIVATIVE_LINES.ready;

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
    } catch {
      setCopied(null);
      setMessage({ ok: false, message: "The browser did not allow copying. Select the text and copy it by hand." });
    }
  };
  const run = (action: () => Promise<DerivativeActionResult>) =>
    startTransition(async () => {
      setCopied(null);
      const result = await action();
      setMessage(result.ok ? null : result);
    });

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
          <TextAreaField
            label={`${spec.label} text`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={channel === "gmb" ? 8 : 12}
            help={`${checks?.characters.toLocaleString("en-GB") ?? 0} of ${spec.max.toLocaleString("en-GB")} characters · version ${latest?.version ?? 1} of ${versions}${latest?.source === "edit" ? ", your edit" : ""}`}
          />
          {checks && checks.issues.length > 0 ? (
            <ul className="app-plain-list small app-text-warning" aria-label="Checks to look at">
              {checks.issues.map((issue, index) => (
                <li key={index}>
                  {issue.message}
                  {issue.quote ? <q className="app-quote">{issue.quote}</q> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {channel === "gmb" ? (
            <p className="small app-muted" style={{ margin: 0 }}>
              Add the post&apos;s link as the &quot;Learn more&quot; button: {postUrl}{" "}
              <Button variant="ghost" size="sm" onClick={() => copy(postUrl, "link")}>
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
      {asking ? (
        <TextAreaField label="Note for the writer (optional)" value={note} onChange={(event) => setNote(event.target.value)} rows={2} help="For example: lead with the drainage point." />
      ) : null}
      <div className="app-review-buttons">
        {latest ? (
          asking ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(async () => (setAsking(false), generateAction(note.trim() || null)))}>
                Regenerate {spec.label}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" disabled={pending || writing} onClick={() => setAsking(true)}>
              Regenerate
            </Button>
          )
        ) : (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => generateAction(null))}>
            Generate {spec.label}
          </Button>
        )}
        {dirty && !writing ? (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => saveAction(text))}>
            Save edit
          </Button>
        ) : null}
        {text && !writing ? (
          <Button size="sm" onClick={() => copy(text, "text")}>
            {copied === "text" ? "Copied" : "Copy"}
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
