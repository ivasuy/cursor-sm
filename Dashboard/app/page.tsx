"use client"

import { useState } from "react"
import {
  ChevronRight,
  Monitor,
  Settings,
  Shield,
  Target,
  Users,
  Bell,
  RefreshCw,
  Activity,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import CommandCenterPage from "./command-center/page"
import AgentNetworkPage from "./agent-network/page"
import OperationsPage from "./operations/page"
import IntelligencePage from "./intelligence/page"
import SystemsPage from "./systems/page"
import UsagePage from "./usage/page"

export default function WorktraceDashboard() {
  const [activeSection, setActiveSection] = useState("usage")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const sectionLabel = {
    usage: "PROVIDER USAGE",
    overview: "COMMAND CENTER",
    agents: "AGENT NETWORK",
    operations: "OPERATIONS",
    intelligence: "INTELLIGENCE",
    systems: "SYSTEMS",
  }[activeSection] || "OVERVIEW"

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div
        className={`${sidebarCollapsed ? "w-16" : "w-70"} bg-wt-raised border-r border-wt-border transition-all duration-300 fixed md:relative z-50 md:z-auto h-full md:h-auto`}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-8">
            <div className={`${sidebarCollapsed ? "hidden" : "block"}`}>
              <h1 className="text-wt-accent font-bold text-lg tracking-wider">WORKTRACE</h1>
              <p className="text-wt-fg-muted text-xs">the operating system for AI dev</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-wt-fg-muted hover:text-wt-accent"
            >
              <ChevronRight
                className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${sidebarCollapsed ? "" : "rotate-180"}`}
              />
            </Button>
          </div>

          <nav className="space-y-2">
            {[
              { id: "usage", icon: Activity, label: "PROVIDER USAGE" },
              { id: "overview", icon: Monitor, label: "COMMAND CENTER" },
              { id: "agents", icon: Users, label: "AGENT NETWORK" },
              { id: "operations", icon: Target, label: "OPERATIONS" },
              { id: "intelligence", icon: Shield, label: "INTELLIGENCE" },
              { id: "systems", icon: Settings, label: "SYSTEMS" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 p-3 rounded transition-colors ${
                  activeSection === item.id
                    ? "bg-wt-accent text-wt-base"
                    : "text-wt-fg-muted hover:text-wt-fg-primary hover:bg-wt-hover"
                }`}
              >
                <item.icon className="w-5 h-5 md:w-5 md:h-5 sm:w-6 sm:h-6" />
                {!sidebarCollapsed && <span className="text-sm font-medium">{item.label}</span>}
              </button>
            ))}
          </nav>

          {!sidebarCollapsed && (
            <div className="mt-8 p-4 bg-wt-surface border border-wt-border rounded">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-wt-accent rounded-full animate-pulse"></div>
                <span className="text-xs text-wt-accent">AGENT ONLINE</span>
              </div>
              <div className="text-xs text-wt-fg-muted font-mono">
                <div>PORT: 9315</div>
                <div>HOST: 127.0.0.1</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Overlay */}
      {!sidebarCollapsed && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarCollapsed(true)} />
      )}

      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${!sidebarCollapsed ? "md:ml-0" : ""}`}>
        {/* Top Toolbar */}
        <div className="h-14 bg-wt-raised border-b border-wt-border flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="text-sm text-wt-fg-muted">
              WORKTRACE / <span className="text-wt-accent">{sectionLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-wt-fg-muted font-mono">
              {new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC
            </div>
            <Button variant="ghost" size="icon" className="text-wt-fg-muted hover:text-wt-accent">
              <Bell className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-wt-fg-muted hover:text-wt-accent">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-auto wt-page-gradient wt-grid-overlay">
          {activeSection === "usage" && <UsagePage />}
          {activeSection === "overview" && <CommandCenterPage />}
          {activeSection === "agents" && <AgentNetworkPage />}
          {activeSection === "operations" && <OperationsPage />}
          {activeSection === "intelligence" && <IntelligencePage />}
          {activeSection === "systems" && <SystemsPage />}
        </div>
      </div>
    </div>
  )
}
