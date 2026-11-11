"use client"

import { createContext, useContext, type ReactNode } from "react"

import type { Permission } from "@/lib/auth/permissions"
import type { WorkspaceContext } from "@/lib/domain/workspace"

const WorkspaceContextValue = createContext<WorkspaceContext | null>(null)

export function WorkspaceProvider({ value, children }: { value: WorkspaceContext; children: ReactNode }) {
  return <WorkspaceContextValue value={value}>{children}</WorkspaceContextValue>
}

export function useWorkspace(): WorkspaceContext {
  const context = useContext(WorkspaceContextValue)
  if (!context) throw new Error("useWorkspace must be used within a WorkspaceProvider")
  return context
}

export function useCan(permission: Permission): boolean {
  return useWorkspace().permissions.includes(permission)
}
