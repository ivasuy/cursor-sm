"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  DollarSign,
  Activity,
  Timer,
  TrendingUp,
} from "lucide-react"

// ── Types matching agent API ─────────────────────────────────────────────

interface QuotaWindow {
  label: string
  used: number | null
  limit: number | null
  remaining: number | null
  unit: string
  resetAt: string | null
}

interface ProviderUsage {
  provider: string
  displayName: string
  plan: string | null
  quotaUsed: number | null
  quotaLimit: number | null
  quotaRemaining: number | null
  quotaUnit: string
  secondary: QuotaWindow | null
  tertiary: QuotaWindow | null
  credits: { balance: number | null; unlimited: boolean; currency: string } | null
  resetAt: string | null
  resetWindow: string | null
  costUsd: number | null
  status: string
  lastFetched: string
  error: string | null
}

// ── Agent API ────────────────────────────────────────────────────────────

const AGENT_URL = "http://127.0.0.1:9315"

async function fetchUsage(refresh = false): Promise<ProviderUsage[]> {
  try {
    const url = refresh ? `${AGENT_URL}/usage/refresh` : `${AGENT_URL}/usage`
    const res = await fetch(url, { method: refresh ? "POST" : "GET" })
    if (!res.ok) throw new Error(`Agent returned ${res.status}`)
    const data = await res.json()
    return data.providers || []
  } catch {
    return []
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  if (status === "ok") return "text-wt-success"
  if (status === "warning") return "text-wt-warning"
  if (status === "exhausted") return "text-wt-error"
  if (status === "error") return "text-wt-error"
  return "text-wt-fg-muted"
}

function statusBg(status: string): string {
  if (status === "ok") return "bg-wt-success/10 border-wt-success/20"
  if (status === "warning") return "bg-wt-warning/10 border-wt-warning/20"
  if (status === "exhausted") return "bg-wt-error/10 border-wt-error/20"
  if (status === "error") return "bg-wt-error/10 border-wt-error/20"
  return "bg-wt-fg-muted/10 border-wt-fg-muted/20"
}

function statusIcon(status: string) {
  if (status === "ok") return <CheckCircle className="w-4 h-4 text-wt-success" />
  if (status === "warning") return <AlertTriangle className="w-4 h-4 text-wt-warning" />
  if (status === "exhausted") return <XCircle className="w-4 h-4 text-wt-error" />
  if (status === "error") return <XCircle className="w-4 h-4 text-wt-error" />
  return <Clock className="w-4 h-4 text-wt-fg-muted" />
}

function statusLabel(status: string): string {
  if (status === "ok") return "Healthy"
  if (status === "warning") return "Near Limit"
  if (status === "exhausted") return "Exhausted"
  if (status === "error") return "Error"
  return "Unknown"
}

function progressColor(pct: number): string {
  if (pct >= 100) return "[&>div]:bg-wt-error"
  if (pct >= 80) return "[&>div]:bg-wt-warning"
  return "[&>div]:bg-wt-accent"
}

function formatReset(resetAt: string | null, resetWindow: string | null): string {
  if (!resetAt && !resetWindow) return "—"
  if (resetAt) {
    const diff = new Date(resetAt).getTime() - Date.now()
    if (diff <= 0) return "Reset due"
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    if (h > 48) return `${Math.floor(h / 24)}d`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }
  return resetWindow || ""
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

// ── Quota Bar Component ──────────────────────────────────────────────────

function QuotaBar({
  label,
  used,
  limit,
  remaining,
  unit,
  resetAt,
}: {
  label: string
  used: number | null
  limit: number | null
  remaining: number | null
  unit: string
  resetAt?: string | null
}) {
  if (used === null && limit === null) return null
  const pct = used !== null && limit !== null && limit > 0 ? Math.min((used / limit) * 100, 100) : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-wt-fg-muted uppercase tracking-wide">{label}</span>
        <span className="text-xs font-mono text-wt-fg-secondary">
          {used !== null && limit !== null ? (
            <>
              <span className="text-wt-fg-primary">{used}</span>
              <span className="text-wt-fg-faint">/</span>
              <span className="text-wt-fg-primary">{limit}</span>
              <span className="text-wt-fg-muted ml-1">{unit}</span>
            </>
          ) : used !== null ? (
            <>
              <span className="text-wt-fg-primary">{used}</span>
              <span className="text-wt-fg-muted ml-1">{unit} used</span>
            </>
          ) : (
            <span className="text-wt-fg-muted">—</span>
          )}
        </span>
      </div>
      <div className="relative">
        <Progress value={pct} className={`h-2 bg-wt-surface ${progressColor(pct)}`} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-wt-fg-muted">
          {pct > 0 ? `${Math.round(pct)}% used` : "0% used"}
        </span>
        <div className="flex items-center gap-3">
          {remaining !== null && (
            <span className="text-wt-accent font-mono">{remaining} remaining</span>
          )}
          {resetAt && (
            <span className="text-wt-info flex items-center gap-1">
              <Timer className="w-3 h-3" />
              {formatReset(resetAt, null)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Provider Card Component ──────────────────────────────────────────────

function ProviderCard({ p }: { p: ProviderUsage }) {
  return (
    <Card className={`bg-wt-raised border-wt-border wt-card-glow transition-all duration-200`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {statusIcon(p.status)}
            <div>
              <CardTitle className="text-base text-wt-fg-primary">{p.displayName}</CardTitle>
              {p.plan && (
                <span className="text-xs text-wt-fg-muted font-mono">{p.plan}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-xs border ${statusBg(p.status)} ${statusColor(p.status)}`}
            >
              {statusLabel(p.status)}
            </Badge>
            <span className="text-xs text-wt-fg-faint">{timeSince(p.lastFetched)}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {p.error ? (
          <div className="p-3 rounded bg-wt-error/10 border border-wt-error/20">
            <p className="text-sm text-wt-error">{p.error}</p>
          </div>
        ) : (
          <>
            {/* Primary Quota */}
            <QuotaBar
              label={p.quotaUnit === "percent" ? "Session (5h)" : "Plan Usage"}
              used={p.quotaUsed}
              limit={p.quotaLimit}
              remaining={p.quotaRemaining}
              unit={p.quotaUnit}
              resetAt={p.resetAt}
            />

            {/* Secondary Quota */}
            {p.secondary && (
              <QuotaBar
                label={p.secondary.label}
                used={p.secondary.used}
                limit={p.secondary.limit}
                remaining={p.secondary.remaining}
                unit={p.secondary.unit}
                resetAt={p.secondary.resetAt}
              />
            )}

            {/* Tertiary Quota */}
            {p.tertiary && (
              <QuotaBar
                label={p.tertiary.label}
                used={p.tertiary.used}
                limit={p.tertiary.limit}
                remaining={p.tertiary.remaining}
                unit={p.tertiary.unit}
                resetAt={p.tertiary.resetAt}
              />
            )}

            {/* Footer: credits, cost, reset */}
            <div className="flex items-center justify-between pt-2 border-t border-wt-border">
              <div className="flex items-center gap-4">
                {p.credits && (
                  <div className="flex items-center gap-1 text-xs">
                    <DollarSign className="w-3 h-3 text-wt-accent" />
                    <span className="text-wt-fg-secondary">
                      {p.credits.unlimited
                        ? "Unlimited"
                        : p.credits.balance !== null
                        ? `${p.credits.currency}${Number(p.credits.balance).toFixed(2)}`
                        : "—"}
                    </span>
                    <span className="text-wt-fg-muted">credits</span>
                  </div>
                )}
                {p.costUsd !== null && (
                  <div className="flex items-center gap-1 text-xs">
                    <TrendingUp className="w-3 h-3 text-wt-warning" />
                    <span className="text-wt-warning">${p.costUsd.toFixed(2)}</span>
                    <span className="text-wt-fg-muted">spent</span>
                  </div>
                )}
              </div>
              {(p.resetAt || p.resetWindow) && (
                <div className="flex items-center gap-1 text-xs text-wt-fg-muted">
                  <Clock className="w-3 h-3" />
                  <span>Resets {formatReset(p.resetAt, p.resetWindow)}</span>
                  {p.resetWindow && <span className="text-wt-fg-faint">({p.resetWindow})</span>}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function UsagePage() {
  const [providers, setProviders] = useState<ProviderUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [agentOnline, setAgentOnline] = useState(true)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)

    const data = await fetchUsage(refresh)
    setProviders(data)
    setAgentOnline(data.length > 0 || !loading)

    if (refresh) setRefreshing(false)
    else setLoading(false)
  }, [loading])

  useEffect(() => {
    load()
    // Poll every 60 seconds
    const interval = setInterval(() => load(), 60_000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const ok = providers.filter((p) => p.status === "ok")
  const warnings = providers.filter((p) => p.status === "warning")
  const exhausted = providers.filter((p) => p.status === "exhausted")
  const errors = providers.filter((p) => p.status === "error")
  const totalCost = providers.reduce((sum, p) => sum + (p.costUsd || 0), 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-wt-fg-primary">Provider Usage Intelligence</h2>
          <p className="text-sm text-wt-fg-muted mt-1">
            Real-time AI provider quotas, costs, and rate limits
          </p>
        </div>
        <Button
          onClick={() => load(true)}
          disabled={refreshing}
          className="bg-wt-accent/10 border border-wt-accent/25 text-wt-accent hover:bg-wt-accent/20 hover:text-wt-accent-bright"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh All"}
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-wt-raised border-wt-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-wt-accent" />
              <div>
                <div className="text-2xl font-bold font-mono text-wt-fg-primary">
                  {providers.length}
                </div>
                <div className="text-xs text-wt-fg-muted">Providers</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-wt-raised border-wt-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-wt-success" />
              <div>
                <div className="text-2xl font-bold font-mono text-wt-success">{ok.length}</div>
                <div className="text-xs text-wt-fg-muted">Healthy</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-wt-raised border-wt-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-wt-warning" />
              <div>
                <div className="text-2xl font-bold font-mono text-wt-warning">
                  {warnings.length}
                </div>
                <div className="text-xs text-wt-fg-muted">Warnings</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-wt-raised border-wt-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-wt-error" />
              <div>
                <div className="text-2xl font-bold font-mono text-wt-error">
                  {exhausted.length + errors.length}
                </div>
                <div className="text-xs text-wt-fg-muted">Issues</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-wt-raised border-wt-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-wt-warning" />
              <div>
                <div className="text-2xl font-bold font-mono text-wt-fg-primary">
                  ${totalCost.toFixed(2)}
                </div>
                <div className="text-xs text-wt-fg-muted">Total Cost</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {exhausted.length > 0 && (
        <div className="p-4 rounded bg-wt-error/10 border border-wt-error/20 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-wt-error flex-shrink-0" />
          <div>
            <span className="text-sm font-medium text-wt-error">Exhausted: </span>
            <span className="text-sm text-wt-fg-secondary">
              {exhausted.map((p) => p.displayName).join(", ")}
            </span>
          </div>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="p-4 rounded bg-wt-warning/10 border border-wt-warning/20 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-wt-warning flex-shrink-0" />
          <div>
            <span className="text-sm font-medium text-wt-warning">Near Limit: </span>
            <span className="text-sm text-wt-fg-secondary">
              {warnings.map((p) => p.displayName).join(", ")}
            </span>
          </div>
        </div>
      )}

      {/* Provider Cards */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-wt-raised border-wt-border animate-pulse">
              <CardHeader className="pb-3">
                <div className="h-5 bg-wt-surface rounded w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-2 bg-wt-surface rounded w-full" />
                <div className="h-2 bg-wt-surface rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : providers.length === 0 ? (
        <Card className="bg-wt-raised border-wt-border">
          <CardContent className="p-12 text-center">
            <Activity className="w-12 h-12 text-wt-fg-faint mx-auto mb-4" />
            <h3 className="text-lg text-wt-fg-primary mb-2">No Providers Detected</h3>
            <p className="text-sm text-wt-fg-muted mb-4">
              {agentOnline
                ? "Run `worktrace usage detect` to scan for installed AI providers."
                : "The Worktrace agent is not running. Start it with `worktrace start`."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {providers
            .filter((p) => p.status !== "unknown" || p.error)
            .map((p) => (
              <ProviderCard key={p.provider} p={p} />
            ))}
        </div>
      )}
    </div>
  )
}
