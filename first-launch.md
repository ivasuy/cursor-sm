# Worktrace First Launch

## Goal
Ship a first version that feels clearly useful and worth trying.

Not a platform launch.
Not the full pivot.
A sharp first release.

## Target first users
- solo builders using Cursor / VS Code heavily
- indie hackers building in public
- devs who want proof of work and continuity between sessions
- AI-assisted coders who lose context between sessions

## First launch wedge
**Worktrace helps you remember what happened in your coding session, what changed, where you got stuck, and what to do next.**

Secondary wedge:
**It turns invisible coding work into visible proof of work.**

## What already exists in the repo
Based on current code/docs, these look real and launchable:

### Keep for launch
1. automatic session tracking
   - file events
   - saves
   - create/delete
   - branch + diff capture

2. structured session summaries
   - session mode
   - friction points
   - grouped code changes
   - readiness/confidence
   - tomorrow checklist

3. personal session notes
   - useful and simple

4. shareable session card
   - strong distribution feature
   - good for build-in-public

5. cross-session memory / continuity
   - this is one of the strongest differentiators already hinted in code
   - should be positioned clearly

6. basic safety monitoring
   - useful if framed correctly
   - not the core hero, but a supporting feature

## Do NOT make these the center of first launch
1. full platform / operating system messaging
2. broad enterprise / team dashboards
3. full CLI story
4. full `worktrace-agent` runtime story
5. provider usage intelligence as the main launch message
6. cloud sync / large dashboard ambitions

These are future roadmap, not first-launch identity.

## Recommended first-launch feature set

### Hero features
1. session memory
   - what changed
   - where you left off
   - what to do next

2. continuity prompt/context
   - generate a project-aware context block from recent work
   - useful for the next session / next AI interaction

3. proof of work
   - shareable session card
   - visible progress

### Support features
4. session notes
5. friction detection
6. basic safety warnings

## First launch positioning
Use one of these directions:

### Option A
**Worktrace is memory for AI-assisted coding.**

### Option B
**Worktrace turns coding sessions into searchable memory and proof of work.**

### Option C
**Worktrace helps developers remember what happened, what changed, and what to do next.**

## What to change before posting heavily
1. make naming consistent everywhere
   - Worktrace vs Cursor Session Tracker

2. rewrite README around the first-launch wedge
   - memory
   - continuity
   - proof of work

3. show one simple user journey
   - code normally
   - end session
   - get summary
   - resume faster next time
   - optionally share proof of work

4. reduce platform-sounding claims publicly
   - do not lead with “operating system for AI-assisted development” for first launch
   - too broad for current stage

5. make the continuity/memory feature obvious in product messaging
   - this is one of the strongest reasons to care

## Suggested first-launch message
**Most coding work disappears after the session ends.
Worktrace keeps the memory: what changed, where you got stuck, and what to do next.**

## What comes after first launch
Only after users respond to the first wedge:
- CLI
- local agent runtime
- usage intelligence
- team/session visibility
- manager/team reporting
- broader dashboard

## Final recommendation
For first launch, keep it tight:
- session tracking
- structured memory
- continuity
- proof of work
- light safety

That is enough to feel useful.
That is enough to post about.
That is enough to learn from.
