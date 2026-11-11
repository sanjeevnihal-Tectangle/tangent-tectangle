import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { ProviderError, type ModelProvider, type ProviderErrorKind, type TextStreamChunk } from "@/lib/ai/provider-types"
import { createFallbackProvider, ProviderHealth } from "@/lib/ai/providers/fallback"

const schema = z.object({ ok: z.boolean() })
const request = { tier: "fast" as const, system: "s", input: "i", schema, schemaName: "t", maxOutputTokens: 100 }

function fakeProvider(
  id: string,
  behaviour: { fail?: ProviderErrorKind; streamFailAfterDelta?: boolean }
): ModelProvider & { calls: number } {
  const provider = {
    id,
    calls: 0,
    modelFor: () => `${id}-model`,
    async generateStructured() {
      provider.calls += 1
      if (behaviour.fail) throw new ProviderError(`${id} failed`, behaviour.fail, id)
      return { data: { ok: true }, usage: { inputTokens: 1, outputTokens: 1 }, model: `${id}-model` }
    },
    async *streamText(): AsyncGenerator<TextStreamChunk> {
      provider.calls += 1
      if (behaviour.fail && !behaviour.streamFailAfterDelta) throw new ProviderError(`${id} failed`, behaviour.fail, id)
      yield { type: "delta", text: `${id}:hello` }
      if (behaviour.streamFailAfterDelta) throw new ProviderError(`${id} broke mid-stream`, "unavailable", id)
      yield { type: "done", usage: { inputTokens: 1, outputTokens: 1 }, model: `${id}-model` }
    },
  }
  return provider as ModelProvider & { calls: number }
}

async function collect(stream: AsyncIterable<TextStreamChunk>) {
  const chunks: TextStreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe("provider failover", () => {
  it("uses the primary provider when it works", async () => {
    const openai = fakeProvider("openai", {})
    const anthropic = fakeProvider("anthropic", {})
    const result = await createFallbackProvider([openai, anthropic], { health: new ProviderHealth() }).generateStructured(request)
    expect(result.model).toBe("openai-model")
    expect(anthropic.calls).toBe(0)
  })

  it("fails over when the primary has no credits", async () => {
    const onFailover = vi.fn()
    const openai = fakeProvider("openai", { fail: "quota" })
    const anthropic = fakeProvider("anthropic", {})
    const result = await createFallbackProvider([openai, anthropic], { health: new ProviderHealth(), onFailover }).generateStructured(request)
    expect(result.model).toBe("anthropic-model")
    expect(onFailover).toHaveBeenCalledWith("openai", expect.objectContaining({ kind: "quota" }))
  })

  it("works in the other direction too", async () => {
    const anthropic = fakeProvider("anthropic", { fail: "auth" })
    const openai = fakeProvider("openai", {})
    const result = await createFallbackProvider([anthropic, openai], { health: new ProviderHealth() }).generateStructured(request)
    expect(result.model).toBe("openai-model")
  })

  it("skips a provider that recently ran out of credits", async () => {
    let now = 0
    const health = new ProviderHealth(() => now)
    const openai = fakeProvider("openai", { fail: "quota" })
    const anthropic = fakeProvider("anthropic", {})
    const provider = createFallbackProvider([openai, anthropic], { health })
    await provider.generateStructured(request)
    await provider.generateStructured(request)
    expect(openai.calls).toBe(1)
    expect(provider.modelFor("fast")).toBe("anthropic-model")
    now += 11 * 60_000
    await provider.generateStructured(request)
    expect(openai.calls).toBe(2)
  })

  it("does not fail over when the user cancels", async () => {
    const anthropic = fakeProvider("anthropic", {})
    const provider = createFallbackProvider([fakeProvider("openai", { fail: "cancelled" }), anthropic], { health: new ProviderHealth() })
    await expect(provider.generateStructured(request)).rejects.toMatchObject({ kind: "cancelled" })
    expect(anthropic.calls).toBe(0)
  })

  it("reports every provider's error when all fail", async () => {
    const provider = createFallbackProvider(
      [fakeProvider("openai", { fail: "quota" }), fakeProvider("anthropic", { fail: "unavailable" })],
      { health: new ProviderHealth() }
    )
    await expect(provider.generateStructured(request)).rejects.toThrow(/openai failed.*anthropic failed/)
  })

  it("fails over a stream that errors before producing text", async () => {
    const provider = createFallbackProvider(
      [fakeProvider("openai", { fail: "quota" }), fakeProvider("anthropic", {})],
      { health: new ProviderHealth() }
    )
    const chunks = await collect(provider.streamText(request))
    expect(chunks[0]).toEqual({ type: "delta", text: "anthropic:hello" })
    expect(chunks.at(-1)).toMatchObject({ type: "done", model: "anthropic-model" })
  })

  it("never mixes providers once a stream has produced text", async () => {
    const anthropic = fakeProvider("anthropic", {})
    const provider = createFallbackProvider(
      [fakeProvider("openai", { streamFailAfterDelta: true }), anthropic],
      { health: new ProviderHealth() }
    )
    await expect(collect(provider.streamText(request))).rejects.toThrow(/mid-stream/)
    expect(anthropic.calls).toBe(0)
  })
})
