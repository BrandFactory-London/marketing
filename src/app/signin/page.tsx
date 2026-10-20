import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandMark } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { signInWithGoogle } from "../actions";
import { SignInError } from "./SignInError";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/signin">) {
  return (
    <main className="app-signin">
      <section className="bfm-card app-signin-card">
        <div className="app-brand app-signin-brand">
          <BrandMark />
          BrandFactory Marketing
        </div>
        <h1 className="title app-page-title">Sign in</h1>
        <Suspense fallback={null}>
          <SignInError searchParams={searchParams} />
        </Suspense>
        <form action={signInWithGoogle}>
          <Button type="submit" className="app-signin-button">
            Sign in with Google
          </Button>
        </form>
      </section>
    </main>
  );
}
