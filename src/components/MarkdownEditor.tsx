"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, StateEffect, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, keymap, placeholder as placeholderText, type DecorationSet } from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// The body editor for Review (γ5 orientation Q1). CodeMirror can mark text inside the editor, which a textarea
// cannot: placeholders get a warning tint and the critic's quotes an underline.

export type Mark = { from: number; to: number; kind: "placeholder" | "issue" | "blocking" };

export type MarkdownEditorHandle = { select: (from: number, to: number) => void; focus: () => void };

type Props = {
  value: string;
  onChange: (value: string) => void;
  marks: readonly Mark[];
  readOnly?: boolean;
  label: string;
};

const setMarks = StateEffect.define<readonly Mark[]>();

const CLASS: Record<Mark["kind"], string> = {
  placeholder: "app-mark-placeholder",
  issue: "app-mark-issue",
  blocking: "app-mark-blocking",
};

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setMarks)) continue;
      const length = transaction.state.doc.length;
      const ranges: Range<Decoration>[] = effect.value
        .filter((mark) => mark.from < mark.to && mark.to <= length)
        .map((mark) => Decoration.mark({ class: CLASS[mark.kind] }).range(mark.from, mark.to));
      next = Decoration.set(ranges, true);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor({ value, onChange, marks, readOnly = false, label }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          marksField,
          placeholderText("Write the post body in Markdown."),
          EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true" }),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The editor is created once; later value changes from outside are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // A value set from outside (a reset or a reload) replaces the document.
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: setMarks.of(marks) });
  }, [marks]);

  useImperativeHandle(ref, () => ({
    select(from, to) {
      const editor = view.current;
      if (!editor) return;
      editor.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
      editor.focus();
    },
    focus() {
      view.current?.focus();
    },
  }));

  return <div ref={host} className="app-editor" data-readonly={readOnly ? "true" : undefined} />;
});
