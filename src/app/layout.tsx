import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"

import { designFontVariables } from "@/components/creative/design-fonts"
import { Providers } from "@/components/providers"

import "./globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] })
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "Tangent — AI Marketing OS", template: "%s · Tangent" },
  description: "Your entire marketing department. Powered by AI.",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#141312" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${designFontVariables} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
