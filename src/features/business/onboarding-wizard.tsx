"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form"
import { toast } from "sonner"

import { TagInput } from "@/components/forms/tag-input"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { saveBusinessProfile } from "@/features/business/actions"
import {
  BUSINESS_MODEL_LABELS,
  BUSINESS_MODELS,
  businessProfileSchema,
  CHANNEL_LABELS,
  INDUSTRIES,
  MARKETING_CHANNELS,
  type BusinessProfile,
} from "@/lib/domain/business"
import { formatINR } from "@/lib/format"
import { workspaceHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"

const STEPS: { title: string; description: string; fields: FieldPath<BusinessProfile>[] }[] = [
  { title: "Business basics", description: "Who you are and where you operate.", fields: ["name", "industry", "website", "city", "region", "country", "businessModel"] },
  { title: "Offering & audience", description: "What you sell and who buys it.", fields: ["description", "productsAndServices", "targetAudience", "customerSegments"] },
  { title: "Competitors & goals", description: "Who you compete with and what success looks like.", fields: ["competitors", "objectives"] },
  { title: "Budget & channels", description: "Where you market today and how much you invest.", fields: ["monthlyBudgetInr", "preferredChannels"] },
  { title: "Review", description: "Confirm the profile every AI agent will use.", fields: [] },
]

const EMPTY: BusinessProfile = {
  name: "",
  industry: "",
  website: "",
  city: "",
  region: "",
  country: "India",
  description: "",
  productsAndServices: [],
  targetAudience: "",
  customerSegments: [],
  businessModel: "b2c",
  competitors: [],
  objectives: [],
  monthlyBudgetInr: 25000,
  preferredChannels: [],
}

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function OnboardingWizard({ initial }: { initial: BusinessProfile | null }) {
  const { workspace } = useWorkspace()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, startSaving] = useTransition()

  const form = useForm<BusinessProfile>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: initial ?? EMPTY,
    mode: "onTouched",
  })
  const { register, control, formState, trigger, getValues } = form
  const errors = formState.errors
  const competitors = useFieldArray({ control, name: "competitors" })

  const next = async () => {
    const valid = await trigger(STEPS[step]!.fields, { shouldFocus: true })
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const submit = () =>
    startSaving(async () => {
      const valid = await trigger()
      if (!valid) {
        const firstInvalid = STEPS.findIndex((s) => s.fields.some((f) => f.split(".")[0]! in form.formState.errors))
        if (firstInvalid >= 0) setStep(firstInvalid)
        toast.error("Some fields need attention.")
        return
      }
      const result = await saveBusinessProfile(workspace.slug, getValues())
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Business profile saved. Every agent now uses it as context.")
      router.push(workspaceHref(workspace.slug, "strategy"))
    })

  const values = useWatch({ control }) as BusinessProfile

  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1" aria-label="Onboarding steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap",
                i === step ? "bg-muted font-medium" : "text-muted-foreground",
                i < step && "hover:bg-muted/60"
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem]",
                  i < step && "border-brand bg-brand text-brand-foreground",
                  i === step && "border-foreground"
                )}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              {s.title}
            </button>
          </li>
        ))}
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (step === STEPS.length - 1) submit()
          else void next()
        }}
        className="min-w-0 space-y-6"
        noValidate
      >
        <div>
          <h2 className="text-lg font-semibold">{STEPS[step]!.title}</h2>
          <p className="text-sm text-muted-foreground">{STEPS[step]!.description}</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            {step === 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business name" htmlFor="name" error={errors.name?.message}>
                  <Input id="name" {...register("name")} aria-invalid={Boolean(errors.name)} placeholder="e.g. Saffron & Sage" />
                </Field>
                <Field label="Industry" htmlFor="industry" error={errors.industry?.message}>
                  <Controller
                    control={control}
                    name="industry"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="industry" className="w-full" aria-invalid={Boolean(errors.industry)}>
                          <SelectValue placeholder="Select an industry">{field.value || undefined}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {INDUSTRIES.map((industry) => (
                            <SelectItem key={industry} value={industry}>
                              {industry}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field label="Website" htmlFor="website" error={errors.website?.message} hint="Optional">
                  <Input id="website" type="url" {...register("website")} placeholder="https://" />
                </Field>
                <Field label="Business model" htmlFor="businessModel" error={errors.businessModel?.message}>
                  <Controller
                    control={control}
                    name="businessModel"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="businessModel" className="w-full">
                          <SelectValue>{BUSINESS_MODEL_LABELS[field.value]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {BUSINESS_MODELS.map((model) => (
                            <SelectItem key={model} value={model}>
                              {BUSINESS_MODEL_LABELS[model]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field label="City" htmlFor="city" error={errors.city?.message}>
                  <Input id="city" {...register("city")} placeholder="e.g. Bengaluru" />
                </Field>
                <Field label="State / region" htmlFor="region" error={errors.region?.message}>
                  <Input id="region" {...register("region")} placeholder="e.g. Karnataka" />
                </Field>
                <Field label="Country" htmlFor="country" error={errors.country?.message}>
                  <Input id="country" {...register("country")} />
                </Field>
              </div>
            ) : null}

            {step === 1 ? (
              <>
                <Field label="Describe the business" htmlFor="description" error={errors.description?.message}>
                  <Textarea id="description" rows={4} {...register("description")} placeholder="What you do, what makes you different, how customers buy from you." />
                </Field>
                <Field label="Products and services" htmlFor="productsAndServices" error={errors.productsAndServices?.message} hint="Press Enter after each item">
                  <Controller control={control} name="productsAndServices" render={({ field }) => <TagInput id="productsAndServices" value={field.value} onChange={field.onChange} invalid={Boolean(errors.productsAndServices)} placeholder="e.g. Wedding catering" />} />
                </Field>
                <Field label="Target audience" htmlFor="targetAudience" error={errors.targetAudience?.message}>
                  <Textarea id="targetAudience" rows={3} {...register("targetAudience")} placeholder="Age, location, interests, needs…" />
                </Field>
                <Field label="Customer segments" htmlFor="customerSegments" error={errors.customerSegments?.message} hint="Optional · press Enter after each segment">
                  <Controller control={control} name="customerSegments" render={({ field }) => <TagInput id="customerSegments" value={field.value} onChange={field.onChange} placeholder="e.g. Corporate HR teams" />} />
                </Field>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <div className="space-y-2">
                  <Label>Competitors</Label>
                  {competitors.fields.length === 0 ? <p className="text-xs text-muted-foreground">Optional, but improves competitor insights.</p> : null}
                  {competitors.fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Input aria-label={`Competitor ${index + 1} name`} placeholder="Name" {...register(`competitors.${index}.name`)} aria-invalid={Boolean(errors.competitors?.[index]?.name)} />
                      <Input aria-label={`Competitor ${index + 1} website`} placeholder="https:// (optional)" {...register(`competitors.${index}.website`)} aria-invalid={Boolean(errors.competitors?.[index]?.website)} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => competitors.remove(index)} aria-label={`Remove competitor ${index + 1}`}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => competitors.append({ name: "", website: "" })} disabled={competitors.fields.length >= 10}>
                    <Plus /> Add competitor
                  </Button>
                </div>
                <Field label="Marketing objectives" htmlFor="objectives" error={errors.objectives?.message} hint="Press Enter after each objective">
                  <Controller control={control} name="objectives" render={({ field }) => <TagInput id="objectives" value={field.value} onChange={field.onChange} invalid={Boolean(errors.objectives)} placeholder="e.g. 120 catering leads per month" />} />
                </Field>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Field label="Monthly marketing budget (₹)" htmlFor="monthlyBudgetInr" error={errors.monthlyBudgetInr?.message} hint="Excludes Tangent subscription. Used to size recommendations.">
                  <Input id="monthlyBudgetInr" type="number" inputMode="numeric" min={0} step={1000} {...register("monthlyBudgetInr", { valueAsNumber: true })} className="max-w-48" />
                </Field>
                <div className="space-y-2">
                  <Label id="channels-label">Preferred channels</Label>
                  <Controller
                    control={control}
                    name="preferredChannels"
                    render={({ field }) => (
                      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="channels-label">
                        {MARKETING_CHANNELS.map((channel) => {
                          const selected = field.value.includes(channel)
                          return (
                            <button
                              key={channel}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => field.onChange(selected ? field.value.filter((c) => c !== channel) : [...field.value, channel])}
                              className={cn(
                                "rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                                selected ? "border-brand bg-brand-subtle text-brand-emphasis" : "hover:bg-muted"
                              )}
                            >
                              {CHANNEL_LABELS[channel]}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  />
                  {errors.preferredChannels ? <p className="text-xs text-destructive">{errors.preferredChannels.message}</p> : null}
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <dl className="grid gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted-foreground">Business</dt>
                <dd>{values.name} · {values.industry}</dd>
                <dt className="text-muted-foreground">Location</dt>
                <dd>{[values.city, values.region, values.country].filter(Boolean).join(", ")}</dd>
                <dt className="text-muted-foreground">Offering</dt>
                <dd>{values.productsAndServices.join(", ")}</dd>
                <dt className="text-muted-foreground">Audience</dt>
                <dd>{values.targetAudience}</dd>
                <dt className="text-muted-foreground">Competitors</dt>
                <dd>{values.competitors.map((c) => c.name).filter(Boolean).join(", ") || "—"}</dd>
                <dt className="text-muted-foreground">Objectives</dt>
                <dd>{values.objectives.join(" · ")}</dd>
                <dt className="text-muted-foreground">Budget</dt>
                <dd>{formatINR(Number.isFinite(values.monthlyBudgetInr) ? values.monthlyBudgetInr : 0)} / month</dd>
                <dt className="text-muted-foreground">Channels</dt>
                <dd>{values.preferredChannels.map((c) => CHANNEL_LABELS[c]).join(", ")}</dd>
              </dl>
            ) : null}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
            <ArrowLeft /> Back
          </Button>
          {step === STEPS.length - 1 ? (
            <Button type="submit" variant="brand" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />} Save business profile
            </Button>
          ) : (
            <Button type="submit">
              Continue <ArrowRight />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
