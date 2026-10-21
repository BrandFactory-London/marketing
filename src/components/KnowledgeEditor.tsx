"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import type { KnowledgeActionState } from "@/app/(app)/_actions/knowledge";
import type { KnowledgeSection, KnowledgeSections } from "@/config/knowledge";
import { wordCount } from "@/lib/format";

type Props = {
  label: string;
  sections: readonly KnowledgeSection[];
  saved: KnowledgeSections;
  // "Version 3, saved 21 Oct 2026 at 14:02", or null before the first save.
  savedLine: string | null;
  action: (state: KnowledgeActionState, formData: FormData) => Promise<KnowledgeActionState>;
};

// One form per tier: the nav switches which section is visible, every text area stays mounted, and one
// "Save version" saves the whole tier as a new version (design decision 7, γ2 orientation Q4).
export function KnowledgeEditor({ label, sections, saved, savedLine, action }: Props) {
  const [current, setCurrent] = useState(sections[0].key);
  const [values, setValues] = useState<KnowledgeSections>(() => ({ ...saved }));
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const dirty = sections.some(({ key }) => normalise(values[key]) !== normalise(saved[key]));

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const status = pending
    ? "Saving"
    : dirty
      ? "Unsaved changes"
      : state.status === "saved"
        ? `Saved as version ${state.version}`
        : state.status === "unchanged"
          ? "No changes to save"
          : null;

  return (
    <form action={formAction} className="app-knowledge" aria-label={label}>
      <nav aria-label={`${label} sections`} className="bfm-card app-knowledge-nav">
        {sections.map((section) => {
          const words = wordCount(values[section.key] ?? "");
          return (
            <button
              key={section.key}
              type="button"
              className="bfm-nav-item"
              aria-current={section.key === current ? "true" : undefined}
              onClick={() => setCurrent(section.key)}
            >
              {section.label}
              <span className="bfm-nav-count">{words === 0 ? "Empty" : `${words} ${words === 1 ? "word" : "words"}`}</span>
            </button>
          );
        })}
      </nav>
      <div className="bfm-card app-knowledge-panel">
        {sections.map((section) => (
          <div key={section.key} hidden={section.key !== current} className="app-stack">
            <h3 className="heading">{section.label}</h3>
            <TextAreaField
              label={`${section.label} (Markdown)`}
              help={section.help}
              name={section.key}
              value={values[section.key] ?? ""}
              onChange={(event) => setValues((previous) => ({ ...previous, [section.key]: event.target.value }))}
              rows={16}
            />
          </div>
        ))}
        {state.status === "error" ? (
          <p className="small app-form-error" role="alert">
            {state.message}
          </p>
        ) : null}
        <div className="app-knowledge-actions">
          <p className="small app-knowledge-status" aria-live="polite">
            {savedLine ?? "Not saved yet"}
            {status ? (
              <>
                {" · "}
                <span className={state.status === "saved" && !dirty && !pending ? "app-saved" : undefined}>{status}</span>
              </>
            ) : null}
          </p>
          <Button type="submit" size="sm" disabled={pending || !dirty}>
            Save version
          </Button>
        </div>
      </div>
    </form>
  );
}

function normalise(text: string | undefined): string {
  return (text ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trimEnd();
}
