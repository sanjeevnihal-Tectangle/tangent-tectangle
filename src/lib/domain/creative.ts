import { z } from "zod"

import { designDocumentSchema, type DesignDocument } from "@/lib/creative/document"
import { storedDesignSpecSchema } from "@/lib/creative/layout"

export const creativeBriefSchema = z.object({
  objective: z.string().max(60),
  description: z.string().max(2000),
  concept: z
    .object({ name: z.string(), visualDirection: z.string(), imagePrompt: z.string() })
    .nullable(),
  spec: storedDesignSpecSchema.nullable(),
  templateId: z.string().nullable(),
})
export type CreativeBrief = z.infer<typeof creativeBriefSchema>

export const creativeProjectSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(160),
  objective: z.string().max(60),
  platform: z.string().max(40),
  formatId: z.string().max(60),
  brandProfileId: z.string().nullable(),
  status: z.enum(["draft", "final"]),
  document: designDocumentSchema,
  brief: creativeBriefSchema,
  updatedAt: z.string(),
})
export type CreativeProject = z.infer<typeof creativeProjectSchema>

export type CreativeProjectSummary = Omit<CreativeProject, "document" | "brief"> & {
  /** First page, for rendering thumbnails. */
  preview: DesignDocument
}
