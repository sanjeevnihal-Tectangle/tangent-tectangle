import type { Metadata } from "next"

import { ResetPasswordForm } from "@/features/auth/auth-forms"

export const metadata: Metadata = { title: "Choose a new password" }

export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}
