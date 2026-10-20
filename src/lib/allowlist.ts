// Only the address in ALLOWED_EMAIL may sign in, and only once Google has verified it.
export function isAllowedSignIn(
  profile: { email?: string | null; email_verified?: boolean | null } | undefined,
  allowedEmail: string | undefined,
): boolean {
  if (!profile?.email || !allowedEmail) return false;
  if (profile.email_verified !== true) return false;
  return profile.email.trim().toLowerCase() === allowedEmail.trim().toLowerCase();
}
