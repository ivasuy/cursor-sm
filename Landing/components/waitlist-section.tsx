"use client"

import { useRef, useState, useEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function WaitlistSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!sectionRef.current || !contentRef.current) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        contentRef.current,
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: contentRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        },
      )
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitted(true)
  }

  return (
    <section
      ref={sectionRef}
      id="waitlist"
      className="relative py-20 md:py-32 pl-6 md:pl-28 pr-6 md:pr-12"
    >
      <div ref={contentRef} className="mx-auto max-w-2xl text-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
          Early Access
        </span>

        <h2 className="mt-5 md:mt-6 font-[var(--font-bebas)] text-4xl md:text-7xl tracking-tight">
          JOIN THE WAITLIST
        </h2>

        <p className="mt-6 text-sm leading-7 text-muted-foreground md:text-base">
          Worktrace is shipping fast. Get early access to workspace memory, safety monitoring,
          and the CLI before general availability.
        </p>

        {submitted ? (
          <div className="mt-12 border border-accent/40 bg-accent/[0.05] px-8 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <div className="flex items-center justify-center gap-3">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-sm uppercase tracking-widest text-accent">
                You&apos;re on the list
              </span>
            </div>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              We&apos;ll reach out when your spot opens up.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-12">
            <div
              className={`flex flex-col sm:flex-row items-stretch gap-0 border transition-colors duration-300 ${
                focused ? "border-accent/60" : "border-border/60"
              } bg-accent/[0.03] shadow-[0_24px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl`}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="your@email.com"
                required
                className="flex-1 bg-transparent px-6 py-4 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
              />
              <button
                type="submit"
                className="group border-t sm:border-t-0 sm:border-l border-border/60 bg-accent/[0.06] px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground transition-all duration-200 hover:bg-accent/[0.15] hover:text-accent"
              >
                <span className="flex items-center justify-center gap-3">
                  Request Access
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  >
                    <path
                      d="M1 7H13M13 7L7 1M13 7L7 13"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="square"
                    />
                  </svg>
                </span>
              </button>
            </div>

            <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
              No spam. Early access only.
            </p>
          </form>
        )}

        {/* Signal dots */}
        <div className="mt-10 md:mt-16 flex flex-wrap items-center justify-center gap-4 md:gap-8">
          {["Extension live", "CLI shipping", "Backend active"].map((label) => (
            <div key={label} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent/60" />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
