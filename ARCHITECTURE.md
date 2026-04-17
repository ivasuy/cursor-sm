# Architecture

Worktrace v0.1 — local-first AI usage intelligence for developers.

---

## 1) System Topology

```mermaid
graph TB
    subgraph "Presentation Clients"
        CLI[worktrace CLI<br/>Terminal renderer]
        EXT[VS Code Extension<br/>Status bar + commands]
    end

    subgraph "Local Agent (127.0.0.1:9315)"
        AGT[worktrace-agent<br/>Express daemon]
        CTX[App Context<br/>db · hosts · cache · fetchDriver]
        WATCH[chokidar<br/>file watcher]
    end

    subgraph "Background Loops"
        ATTR[Attribution Loop<br/>every 60s per provider]
        RECON[Reconcile Loop<br/>daily drift check]
        SAMP[Process Sampler<br/>every 5s]
    end

    subgraph "Storage (~/.worktrace)"
        DB[(report.db<br/>SQLite)]
    end

    subgraph "Provider Data Sources"
        CL[Claude Code<br/>~/.claude/metrics/costs.jsonl]
        CU[Cursor<br/>state.vscdb SQLite]
        CO[Codex CLI<br/>~/.codex/state_5.sqlite]
    end

    CLI -->|HTTP| AGT
    EXT -->|HTTP| AGT
    AGT --- CTX
    WATCH --> AGT
    CTX --> ATTR
    CTX --> RECON
    CTX --> SAMP
    CTX --> DB
    ATTR -->|fetch| CL
    ATTR -->|fetch| CU
    ATTR -->|fetch| CO
    RECON -->|fetch| CL
    RECON -->|fetch| CU
    RECON -->|fetch| CO
```

---

## 2) Agent HTTP Routes

```mermaid
graph LR
    subgraph "Clients"
        CLI[CLI]
        EXT[Extension]
    end

    subgraph "Agent Routes"
        H[/health]
        W[/watch]
        P[/pace]
        U[/usage]
        PR[/providers]
        R[/report]
        RE[/repos]
        WT[/worktrees]
        FT[/features]
        FI[/files]
    end

    subgraph "Services"
        FD[FetchDriver]
        DB[(SQLite)]
        PC[PaceCalculator]
        RS[ReportService]
    end

    CLI --> H
    CLI --> P
    CLI --> U
    CLI --> PR
    CLI --> R
    EXT --> H
    EXT --> P
    EXT --> W

    P --> FD
    P --> PC
    U --> FD
    PR --> FD
    R --> FD
    R --> RS
    RS --> DB
    W --> DB
    RE --> DB
    WT --> DB
    FT --> DB
    FI --> DB
```

---

## 3) Provider Fetch Pipeline

```mermaid
flowchart TD
    START([startAttributionLoops]) --> LOAD[loadAll: claude · cursor · codex]
    LOAD --> PROBE{probeAvailability<br/>hosts}
    PROBE -->|no strategy available| SKIP[skip silently<br/>debug log only]
    PROBE -->|available| TIMER[setInterval sampleIntervalMs]
    TIMER --> TICK[tick every 60s]
    TICK --> CACHE{cache hit?}
    CACHE -->|yes| RETURN[return cached snapshot]
    CACHE -->|no| PIPE[runPipeline]

    PIPE --> S1{strategy.isAvailable?}
    S1 -->|no| UNAVAIL[mark unavailable → next]
    S1 -->|yes| FETCH[strategy.fetch ctx]
    FETCH --> OK{success?}
    OK -->|yes| SNAP[UsageSnapshot]
    OK -->|error| FB{shouldFallback?}
    FB -->|yes| S1
    FB -->|no| THROW[throw error]

    UNAVAIL --> S1
    SNAP --> CACHESET[cache.set]
    CACHESET --> WRITE[writeSnapshot db]
    WRITE --> DELTA[computeDelta prev → now]
    DELTA --> FLUSH[flushActivityWindows]
    FLUSH --> ATTRIB[writeAttributions db]

    THROW --> STALE{stale cache<br/>within TTL?}
    STALE -->|yes| RETURN
    STALE -->|no| ERR[AllStrategiesFailedError]
```

---

## 4) Strategy Resolution per Provider

```mermaid
graph TB
    subgraph "Claude Code"
        CL1[localLogScan<br/>~/.claude/metrics/costs.jsonl]
        CL2[apiKeyHttp<br/>ANTHROPIC_API_KEY → api.anthropic.com]
        CL3[cliPty<br/>claude usage --json]
        CL1 -->|fallback| CL2 -->|fallback| CL3
    end

    subgraph "Cursor"
        CU1[localConfigScan<br/>state.vscdb → aiCodeTracking.dailyStats<br/>+ cursorAuth/accessToken]
    end

    subgraph "Codex CLI"
        CO1[localStateScan<br/>~/.codex/state_5.sqlite<br/>threads.tokens_used]
        CO2[cliPty<br/>codex usage --json]
        CO3[localConfigScan<br/>~/.codex/usage_cache.json]
        CO1 -->|fallback| CO2 -->|fallback| CO3
    end
```

---

## 5) Attribution Flow

```mermaid
flowchart LR
    subgraph "File Events"
        FE[chokidar event<br/>create · modify · delete]
        FC[(file_changes)]
        AW[(activity_windows<br/>worktree · branch · window)]
    end

    subgraph "Provider Snapshots"
        PS[(provider_snapshots)]
        DELTA[delta = used_now - used_prev]
    end

    subgraph "Attribution"
        WEIGHT[weight by file_event_count<br/>per worktree in window]
        AT[(attributions<br/>provider · delta · worktree)]
    end

    subgraph "Report Aggregation"
        REPO[by repo]
        WT[by worktree]
        FEAT[by feature branch]
        FILE[by file]
    end

    FE --> FC --> AW
    PS --> DELTA
    AW --> WEIGHT
    DELTA --> WEIGHT
    WEIGHT --> AT
    AT --> REPO
    AT --> WT
    AT --> FEAT
    AT --> FILE
```

---

## 6) Pace Calculation

```mermaid
flowchart TD
    SNAP[UsageSnapshot] --> QUOTA[pickPrimaryQuota<br/>weekly → session → secondary]
    QUOTA --> INFER[inferPeriodWindowMs<br/>based on time remaining]

    INFER --> W1["≤ 6h remaining → 5h window"]
    INFER --> W2["≤ 2d remaining → 1d window"]
    INFER --> W3["≤ 9d remaining → 7d window"]
    INFER --> W4["≤ 40d remaining → 30d window"]

    W1 & W2 & W3 & W4 --> CALC[computePace<br/>used · limit · periodStart · periodEnd · now]

    CALC --> EXP[expectedPct = elapsed / totalWindow]
    CALC --> ACT[actualPct = used / limit]
    EXP & ACT --> DELTA[delta = actualPct - expectedPct]

    DELTA --> S1{"delta ≤ -10%"}
    DELTA --> S2{"-10% < delta ≤ +10%"}
    DELTA --> S3{"+10% < delta ≤ +30%"}
    DELTA --> S4{"delta > +30%"}

    S1 -->|yes| AHEAD[🟢 ahead]
    S2 -->|yes| ONTRACK[🟡 on-track]
    S3 -->|yes| WARN[🟠 warning]
    S4 -->|yes| CRIT[🔴 critical]
```

---

## 7) Data Model

```mermaid
erDiagram
    repos {
        int id PK
        text path
        text name
    }

    worktrees {
        int id PK
        int repo_id FK
        text path
        text name
    }

    file_changes {
        int id PK
        int worktree_id FK
        text branch
        text file_path
        text event_type
        int changed_at
        text provider
    }

    activity_windows {
        int id PK
        int worktree_id FK
        text branch
        int window_start
        int window_end
        int file_event_count
    }

    provider_snapshots {
        int id PK
        text provider
        int fetched_at
        real used
        real cap
        text unit
        int resets_at
    }

    attributions {
        int id PK
        text provider
        text unit
        real delta
        int snapshot_id FK
        int worktree_id FK
        int since
        int until
    }

    reconciliation_log {
        int id PK
        text provider
        int period_start
        int period_end
        real reported_used
        real attributed_total
        real drift_pct
    }

    repos ||--o{ worktrees : has
    worktrees ||--o{ file_changes : records
    worktrees ||--o{ activity_windows : aggregates
    worktrees ||--o{ attributions : receives
    provider_snapshots ||--o{ attributions : sources
```

---

## 8) Monorepo Layout

```mermaid
graph TD
    ROOT[cursor-sm/]

    ROOT --> CLI_DIR[cli/]
    ROOT --> EXT_DIR[extension/]
    ROOT --> DOCS_DIR[docs/]
    ROOT --> ARCH[ARCHITECTURE.md]

    CLI_DIR --> AGENT[packages/agent/]
    CLI_DIR --> CLI[packages/cli/]

    AGENT --> PROVIDERS[src/providers/]
    AGENT --> REPORT[src/report/]
    AGENT --> ROUTES[src/routes/]
    AGENT --> SERVER[src/server.ts]
    AGENT --> WATCHER[src/watcher.ts]

    PROVIDERS --> HOST[_host/ http · pty · sqlite · keychain]
    PROVIDERS --> SHARED[_shared/ types · registry · fetch-driver]
    PROVIDERS --> PCLAUDE[claude/ descriptor · strategies · parser]
    PROVIDERS --> PCURSOR[cursor/ descriptor · strategies · parser]
    PROVIDERS --> PCODEX[codex/ descriptor · strategies · parser]

    REPORT --> DB[db.ts migrations]
    REPORT --> ALOOP[attribution-loop.ts]
    REPORT --> RLOOP[reconcile-loop.ts]
    REPORT --> PACE[pace-calculator.ts]
    REPORT --> SVC[report-service.ts]

    CLI --> CMDS[src/commands/ pace · usage · report…]
    CLI --> RENDER[src/render/ bars · cards · tables]
    CLI --> AC[src/agent-client.ts]

    EXT_DIR --> VSRC[src/ status bar · commands]
    DOCS_DIR --> SPECS[superpowers/ specs · plans]
```

---

## 9) Build

```bash
# install
cd cli && npm install

# build all workspaces
npm run build --workspaces
# → packages/agent/dist/
# → packages/cli/dist/

# extension (separate)
cd extension && npm run compile

# run
node packages/agent/dist/server.js &
node packages/cli/dist/index.js pace
```
