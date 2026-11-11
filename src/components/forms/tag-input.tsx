"use client"

import { X } from "lucide-react"
import { useState, type KeyboardEvent } from "react"

import { cn } from "@/lib/utils"

/** Free-text list input: Enter or comma adds an item, Backspace removes the last. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  maxItems = 30,
  invalid,
  className,
}: {
  id?: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  maxItems?: number
  invalid?: boolean
  className?: string
}) {
  const [text, setText] = useState("")

  const add = (raw: string) => {
    const item = raw.trim().replace(/,$/, "").trim()
    if (!item || value.includes(item) || value.length >= maxItems) return
    onChange([...value, item])
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault()
      add(text)
      setText("")
    } else if (event.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "border-destructive",
        className
      )}
    >
      {value.map((item) => (
        <span key={item} className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
          <span className="truncate">{item}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== item))}
            className="rounded text-muted-foreground hover:text-foreground"
            aria-label={`Remove ${item}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          add(text)
          setText("")
        }}
        placeholder={value.length ? "" : placeholder}
        aria-invalid={invalid || undefined}
        className="min-w-32 flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}
