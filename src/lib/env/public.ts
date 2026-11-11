import { z } from "zod"

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  /** Forces the labelled demo workspace even when Supabase is configured. */
  NEXT_PUBLIC_TANGENT_FORCE_DEMO: z.enum(["true", "false"]).optional(),
})

/**
 * Public env vars must be referenced statically (process.env.NEXT_PUBLIC_X) so
 * Next.js can inline them into the client bundle.
 */
export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  NEXT_PUBLIC_TANGENT_FORCE_DEMO: process.env.NEXT_PUBLIC_TANGENT_FORCE_DEMO || undefined,
})

export function isSupabaseConfigured(): boolean {
  if (publicEnv.NEXT_PUBLIC_TANGENT_FORCE_DEMO === "true") return false
  return Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
