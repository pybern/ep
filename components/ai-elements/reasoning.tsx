"use client"

import { BrainIcon, ChevronDownIcon, ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react"
import { useState } from "react"

import { MessageResponse } from "@/components/ai-elements/message"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { sanitizeAiMarkdown } from "@/lib/ai/markdown"
import { cn } from "@/lib/utils"

type ReasoningPart = {
  type: string
  text?: string
}

export function ReasoningBlock({
  parts,
  isStreaming = false,
  className,
}: {
  parts: ReasoningPart[]
  isStreaming?: boolean
  className?: string
}) {
  const [isManuallyOpen, setIsManuallyOpen] = useState(false)
  const [isContentExpanded, setIsContentExpanded] = useState(false)
  const reasoning = parts
    .filter((part) => part.type === "reasoning" && part.text?.trim())
    .map((part) => part.text?.trim())
    .join("\n\n")
  const safeReasoning = sanitizeAiMarkdown(reasoning)
  const isLongReasoning =
    safeReasoning.length > 1_200 || safeReasoning.split("\n").length > 12

  if (!safeReasoning) return null

  return (
    <Collapsible
      open={isStreaming || isManuallyOpen}
      onOpenChange={(open) => {
        setIsManuallyOpen(open)
        if (!open) setIsContentExpanded(false)
      }}
      className={cn("w-full rounded-lg border border-border/50 bg-muted/20", className)}
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <BrainIcon
          aria-hidden="true"
          className={cn("size-3.5", isStreaming && "animate-pulse text-primary")}
        />
        <span>{isStreaming ? "Thinking…" : "Reasoning"}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className="ml-auto size-3.5 transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border/40 text-xs text-muted-foreground">
          <div
            className={cn(
              "px-3 py-2",
              isLongReasoning && !isContentExpanded && "max-h-56 overflow-y-auto",
            )}
          >
            <MessageResponse className="text-xs leading-5 text-muted-foreground">
              {safeReasoning}
            </MessageResponse>
          </div>
          {isLongReasoning ? (
            <button
              type="button"
              onClick={() => setIsContentExpanded((current) => !current)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-border/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
            >
              {isContentExpanded ? (
                <>
                  <ChevronsDownUpIcon aria-hidden="true" className="size-3" />
                  Collapse reasoning
                </>
              ) : (
                <>
                  <ChevronsUpDownIcon aria-hidden="true" className="size-3" />
                  Show full reasoning
                </>
              )}
            </button>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
