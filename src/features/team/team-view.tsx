"use client"

import { Check, Copy, Loader2, Minus, UserPlus } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { inviteMember } from "@/features/team/actions"
import { can, PERMISSIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/auth/permissions"
import type { MemberView } from "@/lib/data/types"
import { initials } from "@/lib/format"

const INVITABLE_ROLES = ROLES.filter((r) => r !== "owner")

export function TeamView({ members }: { members: MemberView[] }) {
  const { workspace, mode } = useWorkspace()
  const canManage = useCan("members.manage")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("marketer")
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const invite = () =>
    startTransition(async () => {
      const result = await inviteMember(workspace.slug, { email, role })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setInviteUrl(result.inviteUrl)
      setEmail("")
      toast.success("Invitation created. Share the link with your teammate.")
    })

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.filter((m) => m.status === "active").length} active · {members.filter((m) => m.status === "invited").length} invited</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex size-8 items-center justify-center rounded-md bg-muted text-xs font-medium">{initials(m.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                {m.status === "invited" ? <Badge variant="warning">Invited</Badge> : null}
                <Badge variant="outline">{ROLE_LABELS[m.role]}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-4" /> Invite a teammate
          </CardTitle>
          <CardDescription>
            {mode === "demo" ? "Invitations need Supabase (demo mode)." : "Creates a single-use link valid for 7 days."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              invite()
            }}
          >
            <fieldset disabled={!canManage || mode === "demo" || pending} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger id="invite-role" className="w-full">
                    <SelectValue>{ROLE_LABELS[role]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {INVITABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">
                {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Create invitation
              </Button>
            </fieldset>
            {!canManage ? <p className="text-xs text-muted-foreground">Only owners and admins can invite members.</p> : null}
          </form>
          {inviteUrl ? (
            <div className="mt-4 space-y-1.5 rounded-md border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Invite link (shown once — email delivery is not configured):</p>
              <div className="flex gap-2">
                <Input readOnly value={inviteUrl} className="font-mono text-xs" aria-label="Invite link" />
                <Button type="button" size="icon" variant="outline" aria-label="Copy invite link" onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => toast.success("Copied"))}>
                  <Copy />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Roles & permissions</CardTitle>
          <CardDescription>Enforced on the server and by database row-level security.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 pb-2 font-medium">Permission</th>
                {ROLES.map((r) => (
                  <th key={r} className="pb-2 text-center font-medium">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {PERMISSIONS.map((p) => (
                <tr key={p}>
                  <td className="px-4 py-2 font-mono text-xs">{p}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="py-2 text-center">
                      {can(r, p) ? <Check className="mx-auto size-4 text-success" aria-label="Allowed" /> : <Minus className="mx-auto size-4 text-muted-foreground/40" aria-label="Not allowed" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
