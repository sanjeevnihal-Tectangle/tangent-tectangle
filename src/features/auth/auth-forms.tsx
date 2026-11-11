"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  requestPasswordReset,
  signIn,
  signInWithGoogle,
  signUp,
  updatePassword,
  type AuthFormState,
} from "@/lib/auth/actions"

const INITIAL: AuthFormState = { error: null, message: null }

function FormStatus({ state }: { state: AuthFormState }) {
  if (state.error) return <p className="text-sm text-destructive" role="alert">{state.error}</p>
  if (state.message) return <p className="text-sm text-success" role="status">{state.message}</p>
  return null
}

function GoogleButton({ next }: { next: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="outline" className="w-full">
        Continue with Google
      </Button>
    </form>
  )
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <Separator className="flex-1" /> or <Separator className="flex-1" />
    </div>
  )
}

export function LoginForm({ next, callbackError }: { next: string; callbackError: boolean }) {
  const [state, action, pending] = useActionState(signIn, INITIAL)
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Welcome back to Tangent.</p>
      </div>
      {callbackError ? <p className="text-sm text-destructive" role="alert">That sign-in link is invalid or expired. Try again.</p> : null}
      <GoogleButton next={next} />
      <Divider />
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
              Forgot password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} />
        </div>
        <FormStatus state={state} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Sign in
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        New to Tangent?{" "}
        <Link href="/signup" className="font-medium text-foreground hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, INITIAL)
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-sm text-muted-foreground">Set up your AI marketing department in minutes.</p>
      </div>
      <GoogleButton next="/workspaces" />
      <Divider />
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" autoComplete="name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <FormStatus state={state} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Create account
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, INITIAL)
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="text-sm text-muted-foreground">We&apos;ll email you a secure link.</p>
      </div>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <FormStatus state={state} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Send reset link
        </Button>
      </form>
      <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to sign in
      </Link>
    </div>
  )
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, INITIAL)
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
      </div>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </div>
        <FormStatus state={state} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Update password
        </Button>
      </form>
    </div>
  )
}
