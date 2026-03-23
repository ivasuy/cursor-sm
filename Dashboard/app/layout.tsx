import type React from "react"
import type { Metadata } from "next"
import { Geist_Mono as GeistMono, Inter } from "next/font/google"
import "./globals.css"

const geistMono = GeistMono({ subsets: ["latin"], variable: "--font-geist-mono" })
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  title: "Worktrace Dashboard",
  description: "The operating system for AI-assisted development",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${geistMono.variable} font-sans bg-[#08090d] text-[#e4e6f0] antialiased`}>
        {children}
      </body>
    </html>
  )
}
