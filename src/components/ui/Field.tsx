import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Common = { label: string; help?: ReactNode; error?: string };

// Label, control and help line, shared by inputs, selects and text areas. An error replaces the help text
// and turns the border danger (design/system/README.md).
function FieldShell({
  label,
  help,
  error,
  id,
  className,
  children,
}: Common & { id: string; className?: string; children: (describedBy: string | undefined) => ReactNode }) {
  const helpId = `${id}-help`;
  const message = error ?? help;
  return (
    <div className={["bfm-field", error ? "bfm-field-error" : "", className].filter(Boolean).join(" ")}>
      <label className="bfm-label" htmlFor={id}>
        {label}
      </label>
      {children(message ? helpId : undefined)}
      {message ? (
        <span id={helpId} className="bfm-help">
          {message}
        </span>
      ) : null}
    </div>
  );
}

export function Field({ label, help, error, id, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <FieldShell label={label} help={help} error={error} id={inputId}>
      {(describedBy) => (
        <input id={inputId} className="bfm-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      )}
    </FieldShell>
  );
}

export type SelectOption = { value: string; label: string };

export function SelectField({
  label,
  help,
  error,
  id,
  options,
  ...rest
}: Common & { options: readonly SelectOption[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <FieldShell label={label} help={help} error={error} id={selectId}>
      {(describedBy) => (
        <select id={selectId} className="bfm-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  help,
  error,
  id,
  className,
  ...rest
}: Common & { className?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generatedId = useId();
  const areaId = id ?? generatedId;
  return (
    <FieldShell label={label} help={help} error={error} id={areaId} className={className}>
      {(describedBy) => (
        <textarea id={areaId} className="bfm-input app-textarea" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      )}
    </FieldShell>
  );
}
