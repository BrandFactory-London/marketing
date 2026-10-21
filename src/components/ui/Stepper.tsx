// Where a batch sits in the workflow (design/system/components/Stepper). Review and Publish arrive in γ5 and
// γ6, so they show as upcoming.
export const BATCH_STEPS = ["Spec", "Confirm", "Generate", "Review", "Publish"] as const;
export type BatchStep = (typeof BATCH_STEPS)[number];

export function Stepper({ current }: { current: BatchStep }) {
  const at = BATCH_STEPS.indexOf(current);
  return (
    <ol className="bfm-stepper" aria-label="Batch steps">
      {BATCH_STEPS.map((step, index) => (
        <StepItem key={step} step={step} index={index} at={at} last={index === BATCH_STEPS.length - 1} />
      ))}
    </ol>
  );
}

function StepItem({ step, index, at, last }: { step: string; index: number; at: number; last: boolean }) {
  const state = index < at ? "bfm-step-done" : index === at ? "bfm-step-current" : "";
  return (
    <>
      <li className={["bfm-step", state].filter(Boolean).join(" ")} aria-current={index === at ? "step" : undefined}>
        <span className="bfm-step-dot" aria-hidden="true">
          {index + 1}
        </span>
        {step}
      </li>
      {last ? null : <li className="bfm-step-line" aria-hidden="true" />}
    </>
  );
}
