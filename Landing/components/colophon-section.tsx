"use client"

import { useRef, useEffect } from "react"
import Image from "next/image"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

const columns = [
  {
    title: "Shipping Now",
    items: ["Local session capture", "Deterministic summaries", "History search"],
  },
  {
    title: "Cloud Assist",
    items: ["Google sign-in", "AI summaries", "AI context refresh"],
  },
  {
    title: "Outputs",
    items: ["sessions/context.md", "session-*.md", "shareable cards"],
  },
  {
    title: "CLI Path",
    items: ["worktrace start", "worktrace context", "worktrace check"],
  },
  {
    title: "Watchlist",
    items: ["Agent runtime", "Provider usage intelligence", "Metadata sync polish"],
  },
  {
    title: "Built For",
    items: ["Cursor / VS Code", "terminal workflows", "AI-assisted teams"],
  },
]

export function ColophonSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current) return

    const ctx = gsap.context(() => {
      // Header slide in
      if (headerRef.current) {
        gsap.from(headerRef.current, {
          x: -60,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      // Grid columns fade up with stagger
      if (gridRef.current) {
        const columns = gridRef.current.querySelectorAll(":scope > div")
        gsap.from(columns, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: gridRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      // Footer fade in
      if (footerRef.current) {
        gsap.from(footerRef.current, {
          y: 20,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: footerRef.current,
            start: "top 95%",
            toggleActions: "play none none reverse",
          },
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="colophon"
      className="relative py-20 md:py-32 pb-28 md:pb-32 pl-6 md:pl-28 pr-6 md:pr-12 border-t border-border/30"
    >
      {/* Section header */}
      <div ref={headerRef} className="mb-10 md:mb-16 flex flex-col gap-6 md:gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">04 / Notes</span>
          <h2 className="mt-3 md:mt-4 font-[var(--font-bebas)] text-4xl md:text-7xl tracking-tight">SYSTEM NOTES</h2>
        </div>
        <div className="flex items-center gap-4 border border-accent/20 bg-accent/[0.04] px-5 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
          <Image
            src="/worktrace-logo.svg"
            alt="Worktrace logo"
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
          />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Identity</p>
            <p className="mt-1 text-sm text-foreground/88">Pixel-marked, near-black, editor-native.</p>
          </div>
        </div>
      </div>

      {/* Multi-column layout */}
      <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 md:gap-12">
        {columns.map((column) => (
          <div key={column.title} className="col-span-1">
            <h4 className="mb-4 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">{column.title}</h4>
            <ul className="space-y-3">
              {column.items.map((item) => (
                <li key={item} className="text-sm leading-relaxed text-foreground/82">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom copyright */}
      <div
        ref={footerRef}
        className="mt-24 pt-8 border-t border-border/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          © 2026 Worktrace. Local-first by design.
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">Track the real work. Keep the context.</p>
      </div>
    </section>
  )
}
