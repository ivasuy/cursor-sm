"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
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

const systemRows = [
  { label: "Editor", value: "Cursor / VS Code" },
  { label: "Cloud", value: "Optional backend assist" },
  { label: "Proof", value: "Cards, summaries, history" },
  { label: "CLI", value: "Start, end, context, check" },
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
      className="relative min-h-screen flex items-center pl-6 md:pl-28 pr-6 md:pr-10 lg:pr-16"
    >
      <AnimatedNoise opacity={0.04} />

      {/* Left vertical labels */}
      <div className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground -rotate-90 origin-left block whitespace-nowrap">
          WORKTRACE
        </span>
      </div>

      {/* Main content */}
      <div ref={contentRef} className="flex-1 w-full">
        <SplitFlapAudioProvider>
          <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-3 border border-border/60 bg-white/[0.03] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Local-First Signal Layer
              </div>

              <div className="relative mt-8">
                <div className="pointer-events-none absolute -right-6 top-6 h-28 w-28 rounded-full bg-white/[0.06] blur-3xl" />
                <SplitFlapText text="WORKTRACE" speed={80} />
                <div className="mt-4">
                  <SplitFlapMuteToggle />
                </div>
              </div>

              <h2 className="mt-6 max-w-4xl font-[var(--font-bebas)] text-[clamp(2rem,5vw,4.5rem)] leading-[0.92] tracking-[0.03em] text-foreground">
                Memory, safety, and proof of work for AI-assisted development.
              </h2>

              <p className="mt-8 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                Worktrace turns real coding sessions into reusable context. Track what changed, preserve the thread
                between days, surface risky AI drift before it ships, and extend the same system into the backend,
                dashboard, and upcoming CLI.
              </p>

              <div className="mt-14 flex flex-wrap items-center gap-6 md:gap-8">
                <a
                  href="#watchlist"
                  className="group inline-flex items-center gap-3 border border-foreground/15 bg-white/[0.02] px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground shadow-[0_16px_32px_rgba(0,0,0,0.18)] transition-all duration-200 hover:border-accent hover:bg-white/[0.05] hover:text-accent"
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

              <div className="mt-14 grid gap-4 md:grid-cols-3 md:gap-5">
                {heroSignals.map((signal) => (
                  <div
                    key={signal.label}
                    className="border border-border/60 bg-white/[0.03] px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.2)] backdrop-blur-xl"
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
              <div className="absolute inset-8 rounded-full bg-white/[0.08] blur-3xl" />
              <div className="relative overflow-hidden border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-7 shadow-[0_30px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_32%)]" />
                <div className="relative">
                  <div className="inline-flex items-center gap-3 border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    Current Build
                  </div>

                  <div className="mt-8 flex items-center justify-center border border-white/10 bg-black/30 px-6 py-8">
                    <Image
                      src="/worktrace-logo.svg"
                      alt="Worktrace logo"
                      width={132}
                      height={132}
                      className="h-28 w-28 object-contain"
                    />
                  </div>

                  <div className="mt-8 space-y-4">
                    {systemRows.map((row) => (
                      <div key={row.label} className="flex items-end justify-between gap-4 border-b border-white/8 pb-3">
                        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                          {row.label}
                        </span>
                        <span className="text-right text-sm text-foreground/88">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </SplitFlapAudioProvider>
      </div>

      {/* Floating info tag */}
      <div className="absolute bottom-8 right-6 md:bottom-12 md:right-10 lg:right-16">
        <div className="border border-border/70 bg-white/[0.03] px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground shadow-[0_18px_48px_rgba(0,0,0,0.25)] backdrop-blur-xl">
          build 03 / editor + cloud + cli path
        </div>
      </div>
    </section>
  )
}
