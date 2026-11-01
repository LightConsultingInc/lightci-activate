"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { lookupSignIn, signInWithOrganization, signInWithPassword, type SignInLookup, type SignInResult } from "./actions"

/**
 * Email first. The API says how this address signs in: a company with single sign-on is sent
 * straight to it; a demo or password account gets the password field; anyone else sees both.
 */
export function LoginForm({ authError, provider = "workos", next }: { authError: boolean; provider?: "workos" | "oidc"; next?: string }) {
  // The customer's own identity provider signs everyone in; there is nothing to type here.
  if (provider === "oidc") {
    const href = `/sign-in${next && next.startsWith("/") ? `?next=${encodeURIComponent(next)}` : ""}`
    return (
      <div className="mt-8 space-y-6" data-testid="login-form">
        {authError && (
          <p role="alert" className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail" data-testid="login-error">
            We could not complete sign-in. Try again, or ask your administrator if it keeps happening.
          </p>
        )}
        <Button nativeButton={false} render={<a href={href} data-testid="login-sso" />} className="w-full" size="lg">
          Continue with your company sign-in
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          You will sign in with the same account you use for work. Activate sees usage metadata and the artifacts you submit, never your chats.
        </p>
      </div>
    )
  }
  return <WorkosLoginForm authError={authError} />
}

function WorkosLoginForm({ authError }: { authError: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [lookup, lookupAction, lookingUp] = useActionState<SignInLookup | null, FormData>(lookupSignIn, null)
  const [state, action, pending] = useActionState<SignInResult | null, FormData>(signInWithPassword, null)
  const [orgState, orgAction, orgPending] = useActionState<SignInResult | null, FormData>(signInWithOrganization, null)

  useEffect(() => {
    if (state?.ok || orgState?.ok) router.replace("/")
  }, [state, orgState, router])

  // A company with single sign-on: go there without asking for anything else.
  useEffect(() => {
    if (lookup?.mode === "sso" && lookup.organizationId && !lookup.passwordAllowed) {
      const params = new URLSearchParams({ organization_id: lookup.organizationId, login_hint: email })
      window.location.assign(`/sign-in?${params}`)
    }
  }, [lookup, email])

  // Second step: the account is in more than one organisation, so ask which one to open.
  const choose = state && !state.ok && "chooseOrg" in state ? state.chooseOrg : null
  if (choose) {
    return (
      <div className="mt-8 space-y-4" data-testid="login-choose-org">
        <p className="text-sm text-muted-foreground">Your account belongs to more than one organisation. Which one do you want to open?</p>
        <form action={orgAction} className="space-y-2">
          <input type="hidden" name="pendingToken" value={choose.pendingToken} />
          {choose.organizations.map((o) => (
            <Button key={o.id} type="submit" name="organizationId" value={o.id} variant="outline" className="w-full justify-start" size="lg" disabled={orgPending} data-testid="login-org-option">
              {o.name}
            </Button>
          ))}
          {choose.organizations.length === 0 && <p className="text-sm text-fail">WorkOS did not list any organisations for this account.</p>}
        </form>
        {orgState && !orgState.ok && "error" in orgState && (
          <p role="alert" className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail" data-testid="login-error">{orgState.error}</p>
        )}
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => router.refresh()}>Use a different account</button>
      </div>
    )
  }

  const showPassword = lookup !== null && lookup.mode !== "sso"
  const ssoHref = lookup?.mode === "sso" && lookup.organizationId ? `/sign-in?${new URLSearchParams({ organization_id: lookup.organizationId, login_hint: email })}` : "/sign-in"
  const error = state && !state.ok && "error" in state ? state.error : authError ? "We could not complete sign-in. Try again." : null

  return (
    <div className="mt-8 space-y-6">
      {!showPassword ? (
        <form action={lookupAction} className="space-y-4" data-testid="login-form">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail" data-testid="login-error">{error}</p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={lookingUp || (lookup?.mode === "sso" && !lookup.passwordAllowed)} data-testid="login-continue">
            {lookingUp || (lookup?.mode === "sso" && !lookup.passwordAllowed) ? "One moment…" : "Continue"}
          </Button>
        </form>
      ) : (
        <form action={action} className="space-y-4" data-testid="login-form">
          <input type="hidden" name="email" value={email} />
          <div className="space-y-2">
            <Label htmlFor="email-shown">Email</Label>
            <div className="flex items-center gap-2">
              <Input id="email-shown" type="email" value={email} readOnly className="bg-muted/40" />
              <Button type="button" variant="ghost" size="sm" onClick={() => window.location.assign("/login")} data-testid="login-change-email">Change</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail" data-testid="login-error">{error}</p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={pending} data-testid="login-submit">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      )}
      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 eyebrow">or</span>
      </div>
      <Button nativeButton={false} render={<a href={ssoHref} data-testid="login-sso" />} variant="outline" className="w-full" size="lg">
        Continue with your company sign-in
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        By signing in you agree to your firm&apos;s Claude usage policy. Activate sees usage metadata and the artifacts you submit, never your chats.
      </p>
    </div>
  )
}
