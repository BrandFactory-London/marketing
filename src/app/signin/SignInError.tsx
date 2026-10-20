// Shown when Auth.js sends the visitor back with an error. The allowed address is never shown.
export async function SignInError({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { error } = await searchParams;
  if (!error) return null;
  const message =
    error === "AccessDenied" ? "This Google account does not have access." : "Sign-in did not complete. Try again.";
  return (
    <p className="small app-signin-error" role="alert">
      {message}
    </p>
  );
}
