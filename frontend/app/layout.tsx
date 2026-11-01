import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { Providers } from "@/components/providers"
import { cn } from "@/lib/utils"

// Fonts ship with the app (app/fonts, latin subsets of the variable fonts) so the build and the
// browser never reach Google: self-hosted installs build offline and send nothing to third parties.
const geist = localFont({ src: "./fonts/geist-sans-latin.woff2", weight: "100 900", variable: "--font-geist-sans", display: "swap" })
const geistMono = localFont({ src: "./fonts/geist-mono-latin.woff2", weight: "100 900", variable: "--font-geist-mono", display: "swap" })
const playfair = localFont({ src: "./fonts/playfair-display-latin.woff2", weight: "400 900", variable: "--font-playfair", display: "swap" })

export const metadata: Metadata = {
  title: { default: "LightCI Activate", template: "%s · Activate" },
  description: "AI-native activation and enablement for Claude Enterprise customers. Mastery-gated ladder, governed skill library, measured hours back.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("antialiased", geist.variable, geistMono.variable, playfair.variable)}>
      <body className="min-h-svh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
