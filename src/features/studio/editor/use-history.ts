"use client"

import { useCallback, useRef, useState } from "react"

const LIMIT = 100
const COALESCE_MS = 1000

interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

/**
 * Undo/redo state.
 * - apply: a committed change (coalesced when the same key repeats quickly, e.g. typing)
 * - preview + commitFrom: live changes during a drag, committed as one step on release
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [] })
  const last = useRef<{ key: string; at: number } | null>(null)

  const apply = useCallback((updater: (current: T) => T, coalesceKey?: string) => {
    const now = Date.now()
    const coalesce = Boolean(coalesceKey && last.current?.key === coalesceKey && now - last.current.at < COALESCE_MS)
    last.current = coalesceKey ? { key: coalesceKey, at: now } : null
    setState((s) => {
      const next = updater(s.present)
      if (next === s.present) return s
      return coalesce
        ? { ...s, present: next, future: [] }
        : { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] }
    })
  }, [])

  const preview = useCallback((updater: (current: T) => T) => {
    setState((s) => ({ ...s, present: updater(s.present) }))
  }, [])

  const commitFrom = useCallback((snapshot: T) => {
    last.current = null
    setState((s) => (s.present === snapshot ? s : { past: [...s.past, snapshot].slice(-LIMIT), present: s.present, future: [] }))
  }, [])

  const undo = useCallback(() => {
    last.current = null
    setState((s) => {
      const previous = s.past.at(-1)
      if (previous === undefined) return s
      return { past: s.past.slice(0, -1), present: previous, future: [s.present, ...s.future] }
    })
  }, [])

  const redo = useCallback(() => {
    last.current = null
    setState((s) => {
      const [next, ...rest] = s.future
      if (next === undefined) return s
      return { past: [...s.past, s.present], present: next, future: rest }
    })
  }, [])

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    apply,
    preview,
    commitFrom,
    undo,
    redo,
  }
}
