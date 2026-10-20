import { useId, type InputHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  help?: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

// An error replaces the help text and turns the border danger (design/system/README.md).
export function Field({ label, help, error, id, ...rest }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const message = error ?? help;
  return (
    <div className={error ? "bfm-field bfm-field-error" : "bfm-field"}>
      <label className="bfm-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="bfm-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? helpId : undefined}
        {...rest}
      />
      {message ? (
        <span id={helpId} className="bfm-help">
          {message}
        </span>
      ) : null}
    </div>
  );
}
