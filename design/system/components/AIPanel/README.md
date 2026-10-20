The AI panel is the one place motion lives: it holds work while Claude is writing or checking.

- Structure: a `bfm-aurora` container (add `bfm-aurora-active` while work runs) holding a status line in `bfm-shimmer`, a `bfm-progress` bar with a `bfm-progress-bar` child whose width is the share done, and `bfm-skeleton` lines standing in for text not yet written.
- Show it only during generation and critic checks. When the work finishes, remove `bfm-aurora-active`, replace the shimmer line with a plain result line, and reveal the results with `bfm-reveal`.
- Status lines name the step and the item: "Writing post 2 of 4: Wet room vs shower tray", "Checking against the Migss rules".
- The consumer provides the status text, the progress share and the result content. All looping motion stops under reduced motion.
