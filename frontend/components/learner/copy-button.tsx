"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function CopyButton({ text, label = "Copy", size = "sm", testId, className }: { text: string; label?: string; size?: "sm" | "xs" | "default"; testId?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      data-testid={testId}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch {
          toast.error("Clipboard is blocked in this browser")
        }
      }}
    >
      {copied ? <Check data-icon="inline-start" className="text-pass" /> : <Copy data-icon="inline-start" />}
      {copied ? "Copied" : label}
    </Button>
  )
}
