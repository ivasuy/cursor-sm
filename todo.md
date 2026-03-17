# Worktrace — Development TODO

## Upcoming Tasks

### Phase 3: CLI Tool & Prompt Enhancer
- [ ] Create `worktrace` CLI package (separate npm package)
- [ ] Implement `worktrace start` / `worktrace end` for terminal session tracking
- [ ] Implement `worktrace context` — dump continuity prompt to stdout
- [ ] Implement `worktrace status` — current session stats
- [ ] Implement `worktrace history` — search past sessions
- [ ] Implement `worktrace check` — run safety scan from CLI
- [ ] Build prompt enhancer — wrap user prompts with project-aware context
- [ ] Add project-aware guardrails injection ("Do not modify stable files")
- [ ] Learn from session history to inject user priorities (testing, performance, security)

### Phase 4: Web Dashboard & Cloud Sync
- [ ] Design and build web dashboard (personal dev timeline)
- [ ] Add project health view — stability map, churn hotspots, friction trends
- [ ] Implement streak tracking and productivity trends
- [ ] Build cloud metadata sync API endpoints
- [ ] Add session data export (JSON, CSV)

### Phase 5: Team Features & Monetization
- [ ] Add team view — async standups, who's working on what
- [ ] Build exportable reports for clients/teams
- [ ] Implement daily/weekly digest auto-generation
- [ ] Add billing integration
- [ ] Build enterprise features
