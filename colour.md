# Worktrace Colour System

> Unified design tokens for every surface: Landing, Extension, CLI, Dashboard, Backend auth, and session cards.
> Inspired by factory.ai depth, Cursor's vibrancy, and the existing CLI Matrix energy.

---

## Design Philosophy

- **Dark-first.** Every surface is dark. No light mode.
- **Signal-driven.** The accent color represents the "trace" — the living signal running through sessions, safety checks, and continuity.
- **Blue-black depth.** Backgrounds are blue-tinted, not flat gray. This adds dimension and pairs naturally with the teal-green accent.
- **One accent family.** The CLI's Matrix green (#00FF41) and the web's refined teal (#00e5a0) are the same family at different intensities.

---

## Core Palette

### Backgrounds

| Token              | Hex       | Usage                                       |
|--------------------|-----------|---------------------------------------------|
| `--bg-base`        | `#08090d` | Page/app root background                    |
| `--bg-raised`      | `#0d0f16` | Cards, panels, modals, sidebar              |
| `--bg-surface`     | `#121420` | Elevated surfaces, popovers, dropdowns      |
| `--bg-hover`       | `#181b28` | Hover state on interactive surfaces         |
| `--bg-active`      | `#1f2235` | Active/pressed state                        |

### Foreground / Text

| Token              | Hex       | Usage                                       |
|--------------------|-----------|---------------------------------------------|
| `--fg-primary`     | `#e4e6f0` | Primary text, headings                      |
| `--fg-secondary`   | `#a0a3b5` | Body text, descriptions                     |
| `--fg-muted`       | `#5c5f73` | Captions, labels, timestamps                |
| `--fg-faint`       | `#363849` | Disabled text, decorative elements          |

### Accent — The Trace

| Token              | Hex       | Usage                                       |
|--------------------|-----------|---------------------------------------------|
| `--accent`         | `#00e5a0` | Primary accent — buttons, links, indicators |
| `--accent-bright`  | `#00ffb3` | Hover/active states, emphasis               |
| `--accent-muted`   | `#00e5a033` | Backgrounds behind accent elements (20%)    |
| `--accent-subtle`  | `#00e5a015` | Very faint accent washes (8%)               |
| `--accent-fg`      | `#08090d` | Text on accent-filled backgrounds           |

### Borders & Dividers

| Token              | Hex       | Usage                                       |
|--------------------|-----------|---------------------------------------------|
| `--border`         | `#1c1e2e` | Default borders                             |
| `--border-subtle`  | `#14162280` | Faint dividers (50% opacity)                |
| `--border-accent`  | `#00e5a040` | Accent-tinted borders (25%)                 |
| `--border-hover`   | `#2a2d42` | Borders on hover                            |

### Semantic / Status

| Token              | Hex       | Usage                                       |
|--------------------|-----------|---------------------------------------------|
| `--success`        | `#00e5a0` | Checks passed, safe, good                   |
| `--warning`        | `#f0b429` | Scope drift, usage limits, caution          |
| `--error`          | `#ff4d6a` | Secrets detected, failures, danger          |
| `--info`           | `#5b9aff` | Informational, links, highlights            |

### Semantic Muted (for backgrounds)

| Token              | Hex       | Usage                                       |
|--------------------|-----------|---------------------------------------------|
| `--success-muted`  | `#00e5a015` | Success badge backgrounds                   |
| `--warning-muted`  | `#f0b42915` | Warning badge backgrounds                   |
| `--error-muted`    | `#ff4d6a15` | Error badge backgrounds                     |
| `--info-muted`     | `#5b9aff15` | Info badge backgrounds                      |

---

## Surface-Specific Mappings

### Landing Page

```
background:       --bg-base (#08090d)
card background:  --bg-raised (#0d0f16)
heading text:     --fg-primary (#e4e6f0)
body text:        --fg-secondary (#a0a3b5)
muted labels:     --fg-muted (#5c5f73)
accent elements:  --accent (#00e5a0)
borders:          --border (#1c1e2e)
```

Background gradient:
```css
background:
  radial-gradient(circle at 78% 22%, rgba(0, 229, 160, 0.06), transparent 20%),
  radial-gradient(circle at 18% 74%, rgba(91, 154, 255, 0.04), transparent 24%),
  linear-gradient(180deg, #08090d 0%, #0a0c14 50%, #0d0f18 100%);
```

### Extension (VS Code / Cursor)

```
statusbar active:   --accent (#00e5a0)
statusbar idle:     --fg-muted (#5c5f73)
notification bg:    --bg-surface (#121420)
safety warning:     --warning (#f0b429)
safety error:       --error (#ff4d6a)
safety pass:        --success (#00e5a0)
```

### CLI Terminal

```
primary output:     --cli-green (#00FF41)      ← louder version of --accent for terminal contrast
warning output:     --cli-amber (#FFB000)      ← louder --warning for terminal
error output:       --cli-red (#FF0040)        ← louder --error for terminal
dim text:           --cli-dim (#0D4D1A)
prompt:             --fg-muted (#5c5f73)
banner gradient:    #00FF41 → #00CED1
```

> CLI colors are intentionally louder than web colors. Terminals have different contrast needs.

### Dashboard

```
card background:    --bg-raised (#0d0f16)
chart primary:      --accent (#00e5a0)
chart secondary:    --info (#5b9aff)
chart warning:      --warning (#f0b429)
chart error:        --error (#ff4d6a)
timeline line:      --border (#1c1e2e)
timeline node:      --accent (#00e5a0)
score high (80+):   --success (#00e5a0)
score mid (50-79):  --warning (#f0b429)
score low (<50):    --error (#ff4d6a)
```

### Session Cards (Generated SVG)

```
card bg:            #0d0f16      ← --bg-raised
title bar:          #121420      ← --bg-surface
border:             #1c1e2e      ← --border
green metric:       #00e5a0      ← --success
blue metric:        #5b9aff      ← --info
amber metric:       #f0b429      ← --warning
red metric:         #ff4d6a      ← --error
body text:          #e4e6f0      ← --fg-primary
muted text:         #5c5f73      ← --fg-muted
```

### Backend Auth Page

```
page bg:            --bg-base (#08090d)
form card:          --bg-raised with glassmorphism
button bg:          --accent-muted (rgba(0, 229, 160, 0.12))
button border:      --border-accent (rgba(0, 229, 160, 0.25))
button hover:       --accent-bright (#00ffb3)
error message:      --error (#ff4d6a)
success message:    --success (#00e5a0)
```

---

## Gradients & Effects

### Page Glow

```css
/* Landing hero / section backgrounds */
background:
  radial-gradient(circle at 78% 22%, rgba(0, 229, 160, 0.06), transparent 20%),
  radial-gradient(circle at 18% 74%, rgba(91, 154, 255, 0.04), transparent 24%);
filter: blur(18px);
```

### Card Hover Glow

```css
/* Subtle accent glow on card hover */
box-shadow: 0 0 40px rgba(0, 229, 160, 0.08);
border-color: rgba(0, 229, 160, 0.25);
```

### Glass Effect

```css
/* Cards and panels */
background: rgba(13, 15, 22, 0.8);
backdrop-filter: blur(20px);
border: 1px solid rgba(28, 30, 46, 0.6);
```

### Grid Overlay

```css
/* Subtle background grid */
background-image:
  linear-gradient(rgba(0, 229, 160, 0.02) 1px, transparent 1px),
  linear-gradient(90deg, rgba(0, 229, 160, 0.02) 1px, transparent 1px);
background-size: 24px 24px;
```

---

## Typography Color Pairing

| Element            | Color Token       | Font                |
|--------------------|-------------------|---------------------|
| Display heading    | `--fg-primary`    | Bebas Neue          |
| Section label      | `--accent`        | IBM Plex Mono       |
| Body text          | `--fg-secondary`  | Inter               |
| Code / mono        | `--fg-primary`    | IBM Plex Mono       |
| Captions           | `--fg-muted`      | IBM Plex Mono       |
| Interactive hover  | `--accent-bright` | —                   |

---

## Contrast Ratios (WCAG AA)

| Pair                                    | Ratio  | Pass |
|-----------------------------------------|--------|------|
| `--fg-primary` (#e4e6f0) on `--bg-base` (#08090d) | 14.8:1 | AAA  |
| `--fg-secondary` (#a0a3b5) on `--bg-base`         | 7.6:1  | AAA  |
| `--fg-muted` (#5c5f73) on `--bg-base`             | 3.8:1  | AA   |
| `--accent` (#00e5a0) on `--bg-base`               | 10.2:1 | AAA  |
| `--accent-fg` (#08090d) on `--accent` (#00e5a0)   | 10.2:1 | AAA  |
| `--warning` (#f0b429) on `--bg-base`              | 9.1:1  | AAA  |
| `--error` (#ff4d6a) on `--bg-base`                | 5.9:1  | AA   |

---

## Quick Reference

```
Backgrounds:  #08090d → #0d0f16 → #121420 → #181b28 → #1f2235
Foreground:   #e4e6f0 → #a0a3b5 → #5c5f73 → #363849
Accent:       #00e5a0  (the trace)
Warning:      #f0b429  (amber signal)
Error:        #ff4d6a  (red alert)
Info:         #5b9aff  (blue note)
Border:       #1c1e2e
```
