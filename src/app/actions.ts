"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}

// Runs the same Google sign-in again, which asks for consent and stores a fresh refresh token.
export async function reconnectGoogleAction() {
  await signIn("google", { redirectTo: "/settings/connections" });
}
