The stepper shows where a batch sits in the workflow: Spec, Confirm, Generate, Review, Publish.

- Structure: an ordered list `bfm-stepper` of `bfm-step` items, each with a `bfm-step-dot`, separated by `bfm-step-line`. Add `bfm-step-done` to completed steps and `bfm-step-current` to the active one.
- Place it at the top of every batch screen, under the screen title.
- The consumer provides the step names and which are done. Steps are not clickable ahead of the current one.
