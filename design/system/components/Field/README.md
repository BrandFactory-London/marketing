Fields collect one value each, used throughout the batch spec form and the knowledge pack editor.

- Structure: a `bfm-field` wrapper holding a `bfm-label`, a `bfm-input` (input, select or textarea) and an optional `bfm-help` line.
- Labels are sentence case and always visible; never rely on placeholder text alone.
- Show errors by adding `bfm-field-error` to the wrapper and replacing the help text with the error.
- The consumer provides the label, value, options for selects and validation messages.
- Stack fields `space-4` apart; put two short fields side by side only when they are read together (length range, for example).
