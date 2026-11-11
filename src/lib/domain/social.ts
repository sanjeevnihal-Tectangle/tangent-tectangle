export const CONNECTION_STATUSES = ["active", "needs_reauth", "revoked", "error"] as const
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number]

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  active: "Connected",
  needs_reauth: "Re-authorisation required",
  revoked: "Revoked",
  error: "Connection error",
}

export interface ConnectedAccountView {
  id: string
  provider: string
  externalAccountId: string
  displayName: string
  scopes: string[]
  status: ConnectionStatus
  tokenExpiresAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
  updatedAt: string
}

export const PUBLISHING_JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const
export type PublishingJobStatus = (typeof PUBLISHING_JOB_STATUSES)[number]

export const PUBLISHING_JOB_STATUS_LABELS: Record<PublishingJobStatus, string> = {
  queued: "Queued",
  running: "Publishing",
  succeeded: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
}

export interface PublishingJobView {
  id: string
  contentItemId: string
  contentTitle: string
  platform: string
  connectedAccountId: string
  accountName: string
  approvalRequestId: string
  status: PublishingJobStatus
  scheduledFor: string
  attempts: number
  externalPostId: string | null
  lastError: string | null
  updatedAt: string
}

