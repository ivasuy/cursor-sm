"use client"

import { useEffect, useRef } from "react"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { SplitFlapText, SplitFlapMuteToggle, SplitFlapAudioProvider } from "@/components/split-flap-text"
import { AnimatedNoise } from "@/components/animated-noise"
import { BitmapChevron } from "@/components/bitmap-chevron"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

const heroSignals = [
  { label: "Session Memory", value: "workspace-first continuity" },
  { label: "Safety Checks", value: "diff-aware review layer" },
  { label: "CLI Path", value: "parity watchlist in motion" },
]

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current || !contentRef.current) return

    const ctx = gsap.context(() => {
      gsap.to(contentRef.current, {
        y: -100,
        opacity: 0,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom top",
          scrub: 1,
        },
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="relative min-h-screen flex items-center pt-10 md:pt-14 pb-24 md:pb-0 pl-6 md:pl-28 pr-6 md:pr-10 lg:pr-16"
    >
      <AnimatedNoise opacity={0.04} />

      {/* Left vertical labels — hidden on mobile to avoid overlap */}
      <div className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 hidden md:block">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground -rotate-90 origin-left block whitespace-nowrap">
          WORKTRACE
        </span>
      </div>

      {/* Main content */}
      <div ref={contentRef} className="flex-1 w-full">
        <SplitFlapAudioProvider>
          <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-3 border border-accent/20 bg-accent/[0.05] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-accent/80 shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                Local-First Signal Layer
              </div>

              <div className="relative mt-8">
                <div className="pointer-events-none absolute -right-6 top-6 h-28 w-28 rounded-full bg-accent/[0.08] blur-3xl" />
                <SplitFlapText text="WORKTRACE" speed={80} />
                <div className="mt-4">
                  <SplitFlapMuteToggle />
                </div>
              </div>

              <h2 className="mt-6 max-w-4xl font-[var(--font-bebas)] text-[clamp(2rem,5vw,4.5rem)] leading-[1.1] tracking-[0.03em] text-foreground">
                Memory, safety, and proof of work for AI-assisted development.
              </h2>

              <p className="mt-8 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                Worktrace turns real coding sessions into reusable context. Track what changed, preserve the thread
                between days, surface risky AI drift before it ships, and extend the same system into the backend,
                dashboard, and upcoming CLI.
              </p>

              <div className="mt-8 md:mt-14 flex flex-wrap items-center gap-4 md:gap-8">
                <a
                  href="#watchlist"
                  className="group inline-flex items-center gap-3 border border-accent/25 bg-accent/[0.06] px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground shadow-[0_16px_32px_rgba(0,0,0,0.18)] transition-all duration-200 hover:border-accent/60 hover:bg-accent/[0.12] hover:text-accent"
                >
                  <ScrambleTextOnHover text="Open Watchlist" as="span" duration={0.6} />
                  <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
                </a>
                <a
                  href="#surfaces"
                  className="font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  Product Surfaces
                </a>
              </div>

              <div className="mt-8 md:mt-14 grid gap-3 md:grid-cols-3 md:gap-5">
                {heroSignals.map((signal) => (
                  <div
                    key={signal.label}
                    className="border border-border/60 bg-accent/[0.03] px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.2)] backdrop-blur-xl transition-colors duration-300 hover:border-accent/30"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                      {signal.label}
                    </p>
                    <p className="mt-3 text-sm text-foreground/88">{signal.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <aside className="relative hidden lg:block">
              <div className="absolute inset-8 rounded-full bg-accent/[0.06] blur-3xl" />
              <div className="relative overflow-hidden border border-accent/15 bg-[#0a0c14]/80 shadow-[0_30px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                {/* Terminal title bar */}
                <div className="flex items-center gap-2 border-b border-border/60 bg-accent/[0.03] px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-accent/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-accent/20" />
                  <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
                    worktrace — zsh
                  </span>
                </div>

                {/* Terminal body */}
                <div className="p-5 font-mono text-[12px] leading-[1.8] text-foreground/80 space-y-0.5">
                  <p><span className="text-muted-foreground/50">$</span> worktrace start</p>
                  <p className="text-accent/70">● session started — tracking workspace</p>
                  <p className="text-muted-foreground/40 mt-2">  ...</p>
                  <p className="mt-2"><span className="text-muted-foreground/50">$</span> worktrace end</p>
                  <p className="text-accent/70">● session ended — 47m 12s</p>
                  <p className="text-muted-foreground/50">  12 files changed, 3 commits</p>
                  <p className="text-muted-foreground/50">  summary → .worktrace/session-0322.md</p>
                  <p className="mt-3"><span className="text-muted-foreground/50">$</span> worktrace context</p>
                  <p className="text-accent/70">● context refreshed</p>
                  <p className="text-muted-foreground/50">  → .worktrace/context.md</p>
                  <p className="mt-3"><span className="text-muted-foreground/50">$</span> worktrace check</p>
                  <p className="text-[#00e5a0]/70">✓ no secrets detected</p>
                  <p className="text-[#00e5a0]/70">✓ no risky patterns</p>
                  <p className="text-[#f0b429]/70">⚠ scope drift — 2 files outside intent</p>
                  <p className="mt-3 text-muted-foreground/30"><span className="text-muted-foreground/50">$</span> <span className="animate-pulse">▌</span></p>
                </div>
              </div>
            </aside>
          </div>
        </SplitFlapAudioProvider>
      </div>

      {/* Floating info tag */}
      <div className="absolute bottom-8 right-6 md:bottom-12 md:right-10 lg:right-16 hidden md:block">
        <div className="border border-border/70 bg-accent/[0.03] px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground shadow-[0_18px_48px_rgba(0,0,0,0.25)] backdrop-blur-xl">
          build 03 / editor + cloud + cli path
        </div>
      </div>
    </section>
  )
}
