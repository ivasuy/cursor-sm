"use client"

import { useRef, useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

const watchlist = [
  {
    code: "WT-01",
    status: "LIVE",
    title: "Recover the last thread fast",
    note: "Keep recent intent, branch state, touched files, and tomorrow notes inside the workspace so every next session starts with context instead of guesswork.",
    lane: "Workspace Memory",
  },
  {
    code: "WT-02",
    status: "LIVE",
    title: "Review AI drift from real diffs",
    note: "Scan changes for secrets, risky patterns, and scope creep using the actual git delta rather than a hand-wavy summary.",
    lane: "Safety Layer",
  },
  {
    code: "WT-03",
    status: "ACTIVE",
    title: "Ship reusable context blocks",
    note: "Turn sessions into project context you can carry back into Cursor, Codex, Claude, or the next human handoff.",
    lane: "Continuity Engine",
  },
  {
    code: "WT-04",
    status: "WATCH",
    title: "Bring Worktrace into the CLI",
    note: "Make start, end, context, status, and check workflows feel first-class for terminal sessions, not just editor sessions.",
    lane: "CLI Path",
  },
  {
    code: "WT-05",
    status: "WATCH",
    title: "Track provider usage with context",
    note: "Blend quota, reset windows, and cost signals into the same project memory instead of forcing a separate dashboard ritual.",
    lane: "Usage Intelligence",
  },
]

export function SignalsSection() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    if (!sectionRef.current || !cursorRef.current) return

    const section = sectionRef.current
    const cursor = cursorRef.current

    const handleMouseMove = (e: MouseEvent) => {
      const rect = section.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      gsap.to(cursor, {
        x: x,
        y: y,
        duration: 0.5,
        ease: "power3.out",
      })
    }

    const handleMouseEnter = () => setIsHovering(true)
    const handleMouseLeave = () => setIsHovering(false)

    section.addEventListener("mousemove", handleMouseMove)
    section.addEventListener("mouseenter", handleMouseEnter)
    section.addEventListener("mouseleave", handleMouseLeave)

    return () => {
      section.removeEventListener("mousemove", handleMouseMove)
      section.removeEventListener("mouseenter", handleMouseEnter)
      section.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [])

  useEffect(() => {
    if (!sectionRef.current || !headerRef.current || !cardsRef.current) return

    const ctx = gsap.context(() => {
      // Header slide in from left
      gsap.fromTo(
        headerRef.current,
        { x: -60, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        },
      )

      const cards = cardsRef.current?.querySelectorAll("article")
      if (cards) {
        gsap.fromTo(
          cards,
          { x: -100, opacity: 0 },
          {
            x: 0,
            opacity: 1,
            duration: 0.8,
            stagger: 0.2,
            ease: "power3.out",
            scrollTrigger: {
              trigger: cardsRef.current,
              start: "top 90%",
              toggleActions: "play none none reverse",
            },
          },
        )
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section id="watchlist" ref={sectionRef} className="relative py-32 pl-6 md:pl-28">
      <div
        ref={cursorRef}
        className={cn(
          "pointer-events-none absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 z-50",
          "h-20 w-20 rounded-full border border-accent/25 bg-white/[0.04] shadow-[0_0_50px_rgba(255,255,255,0.1)] backdrop-blur-xl",
          "transition-opacity duration-300",
          isHovering ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Section header */}
      <div ref={headerRef} className="mb-16 flex flex-col gap-6 pr-6 md:pr-12 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">01 / Watchlist</span>
          <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">WHAT TO WATCH</h2>
        </div>
        <p className="max-w-md text-sm leading-7 text-muted-foreground">
          A premium signal rail for what ships now, what hardens the product, and where the CLI joins the system.
        </p>
      </div>

      {/* Horizontal scroll container */}
      <div
        ref={(el) => {
          scrollRef.current = el
          cardsRef.current = el
        }}
        className="flex gap-8 overflow-x-auto pb-8 pr-12 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {watchlist.map((item, index) => (
          <SignalCard key={index} signal={item} index={index} />
        ))}
      </div>
    </section>
  )
}

function SignalCard({
  signal,
  index,
}: {
  signal: { code: string; status: string; title: string; note: string; lane: string }
  index: number
}) {
  return (
    <article
      className={cn(
        "group relative flex-shrink-0 w-80",
        "transition-transform duration-500 ease-out",
        "hover:-translate-y-2",
      )}
    >
      <div className="relative border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl">
        <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        <div className="flex items-baseline justify-between mb-8">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{signal.code}</span>
          <span className="border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
            {signal.status}
          </span>
        </div>

        <h3 className="font-[var(--font-bebas)] text-4xl tracking-tight mb-4 group-hover:text-accent transition-colors duration-300">
          {signal.title}
        </h3>

        <div className="w-12 h-px bg-accent/60 mb-6 group-hover:w-full transition-all duration-500" />

        <p className="font-mono text-xs text-muted-foreground leading-relaxed">{signal.note}</p>

        <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/8 pt-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {signal.lane}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/70">
            No. {String(index + 1).padStart(2, "0")}
          </span>
        </div>
      </div>

      <div className="absolute inset-0 -z-10 translate-x-1 translate-y-1 bg-white/[0.05] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </article>
  )
}
