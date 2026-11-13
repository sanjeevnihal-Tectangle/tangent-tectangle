import "server-only"

import { z } from "zod"

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value && value.trim().length > 0 ? value : undefined))

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,

  /** Comma-separated failover order of AI providers that have keys. */
  AI_PROVIDER_ORDER: z.string().default("openai,anthropic"),
  OPENAI_API_KEY: optionalSecret,
  AI_MODEL_FAST: z.string().default("gpt-5-mini"),
  AI_MODEL_REASONING: z.string().default("gpt-5"),
  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL_FAST: z.string().default("claude-haiku-5-5"),
  ANTHROPIC_MODEL_REASONING: z.string().default("claude-sonnet-5-5"),
  AI_MAX_STEPS_PER_RUN: z.coerce.number().int().min(1).max(10).default(4),

  IMAGE_PROVIDER: z.enum(["none", "openai"]).default("none"),
  IMAGE_MODEL: z.string().default("gpt-image-2.6-sunburst"),
  VIDEO_PROVIDER: z.enum(["none"]).default("none"),

  INTEGRATION_ENCRYPTION_KEY: optionalSecret,

  META_APP_ID: optionalSecret,
  META_APP_SECRET: optionalSecret,
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  GOOGLE_ADS_DEVELOPER_TOKEN: optionalSecret,
  LINKEDIN_CLIENT_ID: optionalSecret,
  LINKEDIN_CLIENT_SECRET: optionalSecret,
  TIKTOK_CLIENT_KEY: optionalSecret,
  TIKTOK_CLIENT_SECRET: optionalSecret,
  N8N_BASE_URL: optionalSecret,
  N8N_API_KEY: optionalSecret,
  RAZORPAY_KEY_ID: optionalSecret,
  RAZORPAY_KEY_SECRET: optionalSecret,
  RAZORPAY_WEBHOOK_SECRET: optionalSecret,

  REDIS_URL: optionalSecret,
  SENTRY_DSN: optionalSecret,
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | undefined

export function serverEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env)
  return cached
}

export function resetServerEnvCache(): void {
  cached = undefined
}
