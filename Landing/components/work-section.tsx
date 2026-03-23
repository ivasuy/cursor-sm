"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

const surfaces = [
  {
    title: "Extension",
    medium: "Cursor + VS Code",
    description:
      "Automatic session capture, deterministic summaries, startup continuity, safety checks, and history search live here today.",
    span: "sm:col-span-2 md:col-span-2 sm:row-span-2 md:row-span-2",
    status: "Shipping now",
  },
  {
    title: "Backend",
    medium: "Optional Cloud Assist",
    description: "Google auth, AI summaries, AI context generation, usage limits, and shareable card support.",
    span: "",
    status: "Enhancement layer",
  },
  {
    title: "Dashboard",
    medium: "Proof of Work",
    description: "Session cards, timelines, and health views turn coding activity into something you can review and share.",
    span: "sm:row-span-2 md:row-span-2",
    status: "Expanding",
  },
  {
    title: "CLI",
    medium: "Terminal Surface",
    description: "Parity for start, end, context, status, and check flows when work begins outside the editor.",
    span: "",
    status: "On deck",
  },
  {
    title: "Continuity Engine",
    medium: "Memory Layer",
    description: "Diffs, notes, branches, and touched files become reusable context instead of disappearing after the session ends.",
    span: "sm:col-span-2 md:col-span-2",
    status: "Core system",
  },
  {
    title: "Safety Monitor",
    medium: "Guardrail Layer",
    description: "Secrets, risky changes, and drift get surfaced with the same signal quality as summaries and cards.",
    span: "",
    status: "Running",
  },
  {
    title: "Session Cards",
    medium: "Shareable Proof",
    description: "Turn completed sessions into visual cards you can share with your team, manager, or portfolio.",
    span: "",
    status: "Live",
  },
]

export function WorkSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current || !headerRef.current || !gridRef.current) return

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
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
        },
      )

      const cards = gridRef.current?.querySelectorAll("article")
      if (cards && cards.length > 0) {
        gsap.set(cards, { y: 60, opacity: 0 })
        gsap.to(cards, {
          y: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: gridRef.current,
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} id="surfaces" className="relative py-20 md:py-32 pl-6 md:pl-28 pr-6 md:pr-12">
      {/* Section header */}
      <div ref={headerRef} className="mb-10 md:mb-16 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">02 / Surfaces</span>
          <h2 className="mt-3 md:mt-4 font-[var(--font-bebas)] text-4xl md:text-7xl tracking-tight">PRODUCT SURFACES</h2>
        </div>
        <p className="hidden md:block max-w-xs font-mono text-xs text-muted-foreground text-right leading-relaxed">
          One system across editor memory, cloud assist, proof of work, and an explicit CLI path.
        </p>
      </div>

      {/* Asymmetric grid */}
      <div
        ref={gridRef}
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 auto-rows-[160px] sm:auto-rows-[180px] md:auto-rows-[200px]"
      >
        {surfaces.map((experiment, index) => (
          <WorkCard key={index} experiment={experiment} index={index} persistHover={index === 0} />
        ))}
      </div>
    </section>
  )
}

function WorkCard({
  experiment,
  index,
  persistHover = false,
}: {
  experiment: {
    title: string
    medium: string
    description: string
    span: string
    status: string
  }
  index: number
  persistHover?: boolean
}) {
  const [isHovered, setIsHovered] = useState(false)
  const cardRef = useRef<HTMLElement>(null)
  const [isScrollActive, setIsScrollActive] = useState(false)

  useEffect(() => {
    if (!persistHover || !cardRef.current) return

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: cardRef.current,
        start: "top 80%",
        onEnter: () => setIsScrollActive(true),
      })
    }, cardRef)

    return () => ctx.revert()
  }, [persistHover])

  const isActive = isHovered || isScrollActive

  return (
    <article
      ref={cardRef}
      className={cn(
        "group relative flex cursor-pointer flex-col justify-between overflow-hidden border border-border/50 bg-[linear-gradient(180deg,rgba(0,229,160,0.03),rgba(0,229,160,0.01))] p-5 shadow-[0_20px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-all duration-500",
        experiment.span,
        isActive && "border-accent/60",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background layer */}
      <div
        className={cn(
          "absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,229,160,0.08),transparent_45%)] transition-opacity duration-500",
          isActive ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{experiment.medium}</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/65">{experiment.status}</span>
        </div>
        <h3
          className={cn(
            "mt-3 font-[var(--font-bebas)] text-2xl md:text-4xl tracking-tight transition-colors duration-300",
            isActive ? "text-accent" : "text-foreground",
          )}
        >
          {experiment.title}
        </h3>
      </div>

      {/* Description - reveals on hover */}
      <div className="relative z-10">
        <p
          className={cn(
            "max-w-[280px] text-sm leading-relaxed text-muted-foreground transition-all duration-500",
            isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
          )}
        >
          {experiment.description}
        </p>
      </div>

      {/* Index marker */}
      <span
        className={cn(
          "absolute bottom-4 right-4 font-mono text-[10px] transition-colors duration-300",
          isActive ? "text-accent" : "text-muted-foreground/40",
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* Corner line */}
      <div
        className={cn(
          "absolute top-0 right-0 w-12 h-12 transition-all duration-500",
          isActive ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="absolute top-0 right-0 w-full h-[1px] bg-accent" />
        <div className="absolute top-0 right-0 w-[1px] h-full bg-accent" />
      </div>
    </article>
  )
}
