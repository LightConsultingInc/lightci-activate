"use client"

import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { signInWithOrganization, signInWithPassword, type SignInResult } from "./actions"

export function LoginForm({ authError }: { authError: boolean }) {
  const router = useRouter()
  const [state, action, pending] = useActionState<SignInResult | null, FormData>(signInWithPassword, null)
  const [orgState, orgAction, orgPending] = useActionState<SignInResult | null, FormData>(signInWithOrganization, null)

  useEffect(() => {
    if (state?.ok || orgState?.ok) router.replace("/")
  }, [state, orgState, router])

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

  return (
    <div className="mt-8 space-y-6">
      <form action={action} className="space-y-4" data-testid="login-form">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required placeholder="you@company.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {(state && !state.ok && "error" in state) || authError ? (
          <p role="alert" className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail" data-testid="login-error">
            {state && !state.ok && "error" in state ? state.error : "We could not complete sign-in. Try again."}
          </p>
        ) : null}
        <Button type="submit" className="w-full" size="lg" disabled={pending} data-testid="login-submit">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 eyebrow">or</span>
      </div>
      <Button nativeButton={false} render={<a href="/sign-in" data-testid="login-sso" />} variant="outline" className="w-full" size="lg">
        Continue with SSO
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        By signing in you agree to your firm&apos;s Claude usage policy. Activate sees usage metadata and the artifacts you submit, never your chats.
      </p>
    </div>
  )
}
