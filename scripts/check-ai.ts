/**
 * Live check of the AI provider chain (same code path as the app).
 * Usage: pnpm ai:check
 */
import { z } from "zod"

import { configuredProviderIds, getModelProvider } from "@/lib/ai/provider"

async function main() {
  const order = configuredProviderIds()
  console.log(`Configured providers (failover order): ${order.join(" → ") || "none"}`)
  const provider = getModelProvider()
  if (!provider) {
    console.log("No AI provider configured. Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY.")
    process.exitCode = 1
    return
  }

  const started = Date.now()
  const structured = await provider.generateStructured({
    tier: "fast",
    system: "You write short marketing copy.",
    input: "One headline for a Bengaluru restaurant's winter menu.",
    schema: z.object({ headline: z.string() }),
    schemaName: "headline",
    maxOutputTokens: 1000,
  })
  console.log(`Structured output via ${structured.model} in ${Date.now() - started} ms: ${JSON.stringify(structured.data)}`)

  let text = ""
  let model = ""
  for await (const chunk of provider.streamText({
    tier: "fast",
    system: "Reply in one short sentence.",
    input: "Say hello to the Tangent team.",
    maxOutputTokens: 200,
  })) {
    if (chunk.type === "delta") text += chunk.text
    else model = chunk.model
  }
  console.log(`Streaming via ${model}: ${text.trim()}`)
}

main().catch((error: unknown) => {
  console.error("AI check failed:", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
