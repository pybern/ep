"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useWorkspaces, useActiveWorkspace } from "@/lib/use-workspace"
import { cn } from "@/lib/utils"
import {
  Database,
  Check,
  ChevronDown,
  Settings,
  Loader2,
  StickyNote,
} from "lucide-react"

interface WorkspaceDropdownProps {
  /** Callback when workspace selection changes */
  onWorkspaceChange?: (workspaceId: string | null) => void
  /** Additional class names */
  className?: string
  /** Variant style */
  variant?: "default" | "compact"
}

export function WorkspaceDropdown({ 
  onWorkspaceChange,
  className,
  variant = "default",
}: WorkspaceDropdownProps) {
  const router = useRouter()
  const { workspaces, isLoading } = useWorkspaces()
  const { activeWorkspaceId, activeWorkspace, setActive, isLoaded } = useActiveWorkspace()
  const [open, setOpen] = useState(false)

  const handleSelectWorkspace = useCallback((id: string | null) => {
    setActive(id)
    onWorkspaceChange?.(id)
    setOpen(false)
  }, [setActive, onWorkspaceChange])

  const handleManageWorkspaces = useCallback(() => {
    setOpen(false)
    router.push("/workspaces")
  }, [router])

  if (!isLoaded || isLoading) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={cn("h-7 text-xs gap-1.5", className)}
        disabled
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading...</span>
      </Button>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5",
            variant === "compact" ? "h-6 text-[10px] px-2" : "h-7 text-xs",
            activeWorkspaceId && "border-amber-500/50 bg-amber-500/5",
            className
          )}
        >
          {activeWorkspaceId ? (
            <>
              <StickyNote className={cn("text-amber-500", variant === "compact" ? "h-3 w-3" : "h-3.5 w-3.5")} />
              <span className="truncate max-w-[100px]">{activeWorkspace?.name || "Workspace"}</span>
            </>
          ) : (
            <>
              <Database className={variant === "compact" ? "h-3 w-3" : "h-3.5 w-3.5"} />
              <span>All</span>
            </>
          )}
          <ChevronDown className={cn("opacity-50", variant === "compact" ? "h-3 w-3" : "h-3.5 w-3.5")} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Select Workspace
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* All (no workspace) option */}
        <DropdownMenuItem
          onClick={() => handleSelectWorkspace(null)}
          className="gap-2"
        >
          <Database className="h-4 w-4" />
          <span className="flex-1">All (no workspace)</span>
          {!activeWorkspaceId && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        
        {workspaces.length > 0 && <DropdownMenuSeparator />}
        
        {/* Workspace list */}
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onClick={() => handleSelectWorkspace(ws.id)}
            className="gap-2"
          >
            <StickyNote className="h-4 w-4 text-amber-500" />
            <span className="flex-1 truncate">{ws.name}</span>
            {activeWorkspaceId === ws.id && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        
        {/* Manage Workspaces link */}
        <DropdownMenuItem
          onClick={handleManageWorkspaces}
          className="gap-2 text-primary"
        >
          <Settings className="h-4 w-4" />
          <span>Manage Workspaces</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
