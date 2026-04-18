# Worktrace TUI Shell — Design Spec

**Date:** 2026-04-18
**Status:** Approved (brainstorm complete, pending implementation plan)

## 1. Problem

Worktrace currently behaves like a traditional multi-command CLI:

- `worktrace providers`
- `worktrace repos`
- `worktrace worktrees`
- `worktrace pace`
- `worktrace report`

That structure is functional, but the UI reads as a simple report tool rather than a serious operator console. The current renderer leans on rounded cards, decorative provider icons, and a command-per-screen flow that makes the product feel fragmented and visually lightweight.

The target product is different:

- one startup command: `worktrace`
- one keyboard-only full-screen terminal interface
- one coherent command deck for navigation
- a premium retro-system boot sequence before the shell appears

The redesign is strictly a presentation-shell change. Provider extraction, agent routes, parsing, cache behavior, and attribution logic are not being redesigned as part of this effort.

## 2. Product Identity

**Worktrace** becomes a keyboard-first TUI shell for monitoring AI tool usage across providers, repos, worktrees, branches, and files.

The intended feel:

- operator console, not dashboard toy
- retro-cinematic boot mood, not gamer neon
- text-first and signal-driven, not icon-led
- dense enough to feel capable, but balanced enough that a normal developer can read it comfortably

Reference direction:

- `lazygit` for shell structure and keyboard seriousness
- `btop` for information credibility, but with less density
- retro 70s/80s system boot aesthetics with restrained green-on-graphite presentation

## 3. Scope

### 3.1 In Scope

- Replace the current multi-command human UX with a single TUI shell launched by `worktrace`
- Add a `1–2s` boot sequence with retro system-startup lines
- Reveal the deck with a smooth scan transition
- Introduce a unified app frame and module navigation system
- Fold `usage` into `providers`
- Add in-app `View JSON` and `Copy JSON` actions
- Redesign visual language, paneling, typography hierarchy, and module layout

### 3.2 Out of Scope

- Provider extraction rewrites
- Agent-side business logic redesign
- Changes to provider parsing or data truth
- New attribution semantics
- New analytics metrics
- Reworking how the daemon fetches, caches, or stores provider data

## 4. Core Product Decision

Worktrace will no longer present itself as a collection of separate human-facing commands. It becomes a single shell application.

### 4.1 Entry Model

- Primary entrypoint: `worktrace`
- On launch, the app boots into the TUI shell
- Old human-facing subcommands are removed

This is an intentional UX break. The product is being repositioned from “CLI reports” to “terminal application.”

## 5. Shell Architecture

The TUI is a presentation layer over the existing CLI/agent data surfaces. The architecture separates UI state from data state so the shell can be redesigned without destabilizing extraction logic.

### 5.1 Frame

The shell uses a persistent four-zone frame:

- top status strip
- left command rail
- main content pane
- bottom shortcut/status strip

### 5.2 Landing View

The default landing view is the **Command Deck**.

The Command Deck is not a maximal dashboard. It is a balanced overview surface that highlights the most important operational signals:

- overall spend / token posture
- provider pressure
- active repos / worktrees
- current pace / report health
- selected module preview

It should help the user orient immediately, then drill into a module without leaving the shell.

### 5.3 Modules

Day-one modules:

- `providers`
- `repos`
- `worktrees`
- `features`
- `files`
- `pace`
- `watch`
- `report`

`usage` does not remain a separate module. Its concerns are folded into `providers`.

## 6. Navigation Model

The shell is keyboard-only.

Mouse interaction is explicitly out of scope.

### 6.1 Navigation Principles

- fast enough for power users
- obvious enough for a normal developer
- no hidden dependence on mouse support

### 6.2 Core Controls

- arrow keys or `j/k` for vertical movement
- `h/l` or tab family for region changes
- `enter` to drill into a selection
- `esc` to go back one level
- `/` to search or jump
- `q` to quit

The shell may also support fast module hotkeys, but the baseline interaction model must remain readable and discoverable from the UI chrome itself.

## 7. Visual System

### 7.1 Mood

The UI should look like an operator console, not a childlike dashboard.

Desired qualities:

- dark graphite foundation
- restrained signal-green accent
- sharp paneling
- low-noise chrome
- minimal decorative treatment
- premium, serious, readable

### 7.2 Color Direction

Primary palette:

- background: deep graphite / near-black
- accent: signal green
- secondary text: cool gray
- status states: derived from the same restrained family, not rainbow-heavy

The UI should avoid:

- playful saturated accent mixes
- oversized branded color usage
- rounded-card SaaS styling

### 7.3 Provider Branding

Provider presentation becomes text-first.

- no large colored provider icons
- no playful brand badges dominating the screen
- names, status text, and structured metrics do the primary work

If provider marks exist at all, they should be subtle and secondary.

### 7.4 Density Rule

The target density is **balanced**.

That means:

- not sparse
- not btop-level overload
- enough whitespace to stay readable
- enough structure to feel capable

The user should be able to scan the deck without being hit with too much information at once.

## 8. Boot Sequence

### 8.1 Purpose

The boot is a signature brand moment. It sets the tone before the shell appears.

It should feel like a retro system startup from an old film or terminal sequence, but still disciplined and premium.

### 8.2 Timing

- target duration: `1–2s`

This should be long enough to feel intentional, but short enough that repeat use does not become irritating.

### 8.3 Composition

Chosen direction: **full boot stream without large ASCII art**

The boot sequence shows animated system-startup lines such as:

- loading module registry
- binding provider surfaces
- hydrating cached snapshots
- restoring tracked repos
- arming command deck

The sequence should not depend on a large custom ASCII logo or complex art asset that becomes hard to maintain.

### 8.4 Transition

On completion, the boot sequence reveals the command deck with a smooth **scan reveal** transition.

The transition should feel terminal-native and clean, not flashy.

## 9. Module Presentation Rules

Each module lives inside the same shell and swaps content in the main pane.

The app should support list/detail flows without feeling like separate commands launched from scratch.

### 9.1 Providers

`providers` becomes one of the most important modules.

It should support:

- provider list
- focused provider detail
- quota pressure
- cost and token volume
- sessions
- model breakdown
- JSON actions for the focused provider surface

### 9.2 Repos / Worktrees / Features / Files

These modules should prefer a list-or-table first view with a detail inspector or focused pane for the current selection.

The UI should stay consistent across these modules so the user learns one shell, not eight unrelated screens.

### 9.3 Pace / Report

These modules should present summary-first views with drill-in paths where needed.

They should feel like operational views inside the same console, not separate dashboard themes.

### 9.4 Watch

`watch` should become an operational screen inside the shell rather than a separate one-off CLI action.

## 10. JSON Handling

Raw JSON remains useful for power users, but it stops being the main UX mode.

Instead of a top-level `--json` user flow, the shell provides:

- `View JSON`
- `Copy JSON`

These actions operate on the currently focused module, record, or detail view.

This keeps machine-shaped output available without forcing users out of the shell model.

## 11. Data and Logic Boundary

This redesign must not change the extraction or provider logic unless a tiny adapter is absolutely required to display an existing result inside the shell.

### 11.1 Must Stay Untouched

- agent extraction logic
- provider fetch logic
- provider parsers
- attribution semantics
- cache behavior
- route truth and business logic

### 11.2 What Changes

- shell orchestration
- renderer layer
- UI state management
- human interaction flow
- command registration and entry UX

The implementation should reuse existing fetch/report surfaces as much as possible.

## 12. State Model

The TUI must keep UI state separate from data state.

### 12.1 UI State

- active module
- focused region
- selected item
- current filter/search state
- JSON inspector open/closed
- boot/transition state

### 12.2 Data State

- payloads fetched from the existing agent/client surfaces
- refresh state and transient errors
- cached results already produced by the current backend logic

This separation reduces risk and keeps the redesign from leaking into provider behavior.

## 13. Testing Strategy

### 13.1 Unit Tests

Test the shell state machine and interaction flow:

- module switching
- region focus movement
- selection and drill-in
- back navigation
- JSON inspector state

### 13.2 Renderer / Snapshot Coverage

Validate the rendering of key surfaces:

- boot stream
- command deck
- provider list/detail
- repo/worktree list views
- JSON inspector

### 13.3 Integration Tests

Integration coverage should confirm that:

- the shell still receives the same data from existing logic
- removing old human-facing commands does not require rewriting provider internals
- boot and navigation changes do not mutate data correctness

### 13.4 Manual QA

Manual checks should cover:

- small and large terminal sizes
- narrow-width fallback behavior
- no-color / reduced terminal capability where relevant
- repeated launches to confirm boot timing still feels good
- keyboard-only flow across all modules

## 14. Risks

### 14.1 UX Break

Removing old commands is a deliberate break. That is acceptable, but it means the implementation must be coherent enough that the new shell feels clearly better, not merely different.

### 14.2 Scope Creep

Because this is a visible redesign, there is a risk of drifting into agent-side rewrites. The implementation plan must explicitly keep data logic reuse as the default.

### 14.3 Over-Styling

The retro boot mood should not leak into the steady-state shell so heavily that the app becomes gimmicky. The shell itself must stay calm, readable, and premium.

## 15. Success Criteria

The redesign is successful if:

- users launch `worktrace` and land in a coherent full-screen command deck
- the app feels like a serious operator console rather than a toy dashboard
- the boot sequence adds mood without becoming annoying
- module navigation is keyboard-fast and readable
- JSON inspection remains available in-app
- provider/extraction logic remains effectively unchanged

