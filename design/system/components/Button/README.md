Buttons trigger one action each, labelled as a verb plus an object.

- Classes: `bfm-btn` plus one variant: `bfm-btn-primary`, `bfm-btn-secondary`, `bfm-btn-ghost` or `bfm-btn-danger`. Add `bfm-btn-sm` in tables and toolbars.
- One primary button per view, for the step that moves the workflow forward ("Confirm spec", "Generate batch", "Approve post").
- Secondary for alternatives that keep you on the screen; ghost for low-weight actions such as "Cancel"; danger for "Reject" and "Delete".
- The consumer provides the label and, optionally, a 20px outline icon before it.
- Use a native `<button>`; set `disabled` rather than hiding an action that is not available yet.
