// Shown when Auth.js sends the visitor back with an error. The allowed address is never shown.
const MESSAGES: Record<string, string> = {
  AccessDenied: "This Google account does not have access.",
  EncryptionKey: "Sign-in is switched off: the server's encryption key (APP_ENCRYPTION_KEY) is missing or invalid.",
  GoogleTokenNotSaved:
    "Google accepted the sign-in, but the Google connection could not be saved, so you are not signed in. Try again. If it happens again, check the server log.",
  Configuration: "Sign-in could not finish because of a server problem. Check the server log.",
};

export async function SignInError({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { error } = await searchParams;
  if (!error) return null;
  const message = (typeof error === "string" && MESSAGES[error]) || "Sign-in did not complete. Try again.";
  return (
    <p className="small app-signin-error" role="alert">
      {message}
    </p>
  );
}
