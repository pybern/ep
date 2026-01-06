"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Draggable, { DraggableEvent, DraggableData } from "react-draggable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiTester } from "@/components/testers/api-tester"
import { JdbcTester } from "@/components/testers/jdbc-tester"
import { OdbcTester } from "@/components/testers/odbc-tester"
import { OpenAiTester } from "@/components/testers/openai-tester"
import { TestHistory } from "@/components/test-history"
import { CredentialSettings } from "@/components/credential-settings"
import { OpenAICredentialSettings } from "@/components/openai-credential-settings"
import { Shield, Zap, Globe, Database, Server, Sparkles, X, ChevronDown, ChevronUp, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { DremioCredentials } from "@/lib/credential-store"

export type TestResult = {
  id: string
  type: "api" | "jdbc" | "odbc" | "openai"
  connectionString: string
  status: "success" | "error" | "pending"
  message: string
  responseTime?: number
  timestamp: Date
  details?: Record<string, unknown>
}

interface FloatingWidgetProps {
  defaultOpen?: boolean
  onCredentialsChange?: (credentials: DremioCredentials | null) => void
  openSettingsRef?: React.MutableRefObject<(() => void) | null>
}

const BUTTON_SIZE = 44
const MARGIN = 12

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export function FloatingWidget({ defaultOpen = false, onCredentialsChange, openSettingsRef }: FloatingWidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [history, setHistory] = useState<TestResult[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [activeTab, setActiveTab] = useState("credentials")

  // Expose openSettings function via ref
  useEffect(() => {
    if (openSettingsRef) {
      openSettingsRef.current = () => {
        setIsOpen(true)
        setActiveTab("credentials")
      }
    }
    return () => {
      if (openSettingsRef) {
        openSettingsRef.current = null
      }
    }
  }, [openSettingsRef])
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isSnapping, setIsSnapping] = useState(false)
  const [bounds, setBounds] = useState({ left: 0, top: 0, right: 0, bottom: 0 })
  const nodeRef = useRef<HTMLDivElement>(null)
  const dragDistanceRef = useRef(0)

  // Get corner positions
  const getCornerPositions = useCallback(() => {
    const maxX = window.innerWidth - BUTTON_SIZE - MARGIN
    const maxY = window.innerHeight - BUTTON_SIZE - MARGIN
    return {
      'top-left': { x: MARGIN, y: MARGIN },
      'top-right': { x: maxX, y: MARGIN },
      'bottom-left': { x: MARGIN, y: maxY },
      'bottom-right': { x: maxX, y: maxY }
    }
  }, [])

  // Find closest corner
  const findClosestCorner = useCallback((currentX: number, currentY: number): Corner => {
    const corners = getCornerPositions()
    let closestCorner: Corner = 'bottom-right'
    let minDistance = Infinity

    for (const [corner, pos] of Object.entries(corners)) {
      const distance = Math.sqrt(
        Math.pow(currentX - pos.x, 2) + Math.pow(currentY - pos.y, 2)
      )
      if (distance < minDistance) {
        minDistance = distance
        closestCorner = corner as Corner
      }
    }

    return closestCorner
  }, [getCornerPositions])

  // Snap to corner with animation
  const snapToCorner = useCallback((corner: Corner) => {
    const corners = getCornerPositions()
    const targetPos = corners[corner]
    setIsSnapping(true)
    setPosition(targetPos)
    // Reset snapping state after animation completes
    setTimeout(() => setIsSnapping(false), 300)
  }, [getCornerPositions])

  // Calculate initial position and bounds on mount
  useEffect(() => {
    const updateBounds = () => {
      const maxX = window.innerWidth - BUTTON_SIZE - MARGIN
      const maxY = window.innerHeight - BUTTON_SIZE - MARGIN
      setBounds({
        left: MARGIN,
        top: MARGIN,
        right: maxX,
        bottom: maxY
      })
      // Set initial position to bottom-right
      setPosition({
        x: maxX,
        y: maxY
      })
    }
    
    updateBounds()
    window.addEventListener('resize', updateBounds)
    return () => window.removeEventListener('resize', updateBounds)
  }, [])

  // Handle window resize - snap to nearest corner
  useEffect(() => {
    const handleResize = () => {
      const maxX = window.innerWidth - BUTTON_SIZE - MARGIN
      const maxY = window.innerHeight - BUTTON_SIZE - MARGIN
      setBounds({
        left: MARGIN,
        top: MARGIN,
        right: maxX,
        bottom: maxY
      })
      // Snap to closest corner on resize
      const closestCorner = findClosestCorner(position.x, position.y)
      snapToCorner(closestCorner)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [position, findClosestCorner, snapToCorner])

  const handleDragStart = useCallback(() => {
    dragDistanceRef.current = 0
    setIsDragging(true)
    setIsSnapping(false)
  }, [])

  const handleDrag = useCallback((_e: DraggableEvent, data: DraggableData) => {
    dragDistanceRef.current += Math.abs(data.deltaX) + Math.abs(data.deltaY)
  }, [])

  const handleDragStop = useCallback((_e: DraggableEvent, data: DraggableData) => {
    setIsDragging(false)
    // Find and snap to closest corner
    const closestCorner = findClosestCorner(data.x, data.y)
    snapToCorner(closestCorner)
  }, [findClosestCorner, snapToCorner])

  const handleButtonClick = useCallback(() => {
    // Only open if we barely moved (less than 5px total)
    if (dragDistanceRef.current < 5) {
      setIsOpen(true)
    }
    dragDistanceRef.current = 0
  }, [])

  const addResult = useCallback((result: Omit<TestResult, "id" | "timestamp">) => {
    setHistory((prev) =>
      [
        {
          ...result,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        },
        ...prev,
      ].slice(0, 50),
    )
  }, [])

  const clearHistory = useCallback(() => setHistory([]), [])

  // Calculate dialog position based on button position
  const getDialogStyle = useCallback((): React.CSSProperties => {
    if (typeof window === 'undefined') return {}
    
    const buttonCenterX = position.x + BUTTON_SIZE / 2
    const buttonCenterY = position.y + BUTTON_SIZE / 2
    const dialogWidth = Math.min(800, window.innerWidth - 32)
    const dialogHeight = Math.min(700, window.innerHeight - 128)
    
    // Determine which quadrant the button is in
    const isRight = buttonCenterX > window.innerWidth / 2
    const isBottom = buttonCenterY > window.innerHeight / 2
    
    let left = isRight ? position.x - dialogWidth + BUTTON_SIZE : position.x
    let top = isBottom ? position.y - dialogHeight - 16 : position.y + BUTTON_SIZE + 16
    
    // Clamp to viewport
    left = Math.max(16, Math.min(window.innerWidth - dialogWidth - 16, left))
    top = Math.max(16, Math.min(window.innerHeight - dialogHeight - 16, top))
    
    return { 
      left, 
      top, 
      width: dialogWidth, 
      maxHeight: dialogHeight 
    }
  }, [position])

  return (
    <>
      {/* Dialog Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Panel */}
          <div 
            className="fixed z-50 rounded-2xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/30 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={getDialogStyle()}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border/50 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-primary/15 border border-primary/25">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-foreground">Connection Tester</h2>
                  <p className="text-[10px] text-muted-foreground">Test API, JDBC, ODBC & OpenAI</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mr-2">
                  <Shield className="h-3 w-3 text-primary/70" />
                  <span>Secure</span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="border-b border-border/50 px-3 shrink-0">
                <TabsList className="h-9 bg-transparent gap-1">
                  <TabsTrigger
                    value="credentials"
                    className="text-xs data-[state=active]:bg-accent/80 data-[state=active]:text-accent-foreground gap-1.5 px-2.5 h-7"
                  >
                    <Settings className="h-3 w-3" />
                    Credentials
                  </TabsTrigger>
                  <TabsTrigger
                    value="api"
                    className="text-xs data-[state=active]:bg-accent/80 data-[state=active]:text-accent-foreground gap-1.5 px-2.5 h-7"
                  >
                    <Globe className="h-3 w-3" />
                    API
                  </TabsTrigger>
                  <TabsTrigger
                    value="jdbc"
                    className="text-xs data-[state=active]:bg-accent/80 data-[state=active]:text-accent-foreground gap-1.5 px-2.5 h-7"
                  >
                    <Database className="h-3 w-3" />
                    JDBC
                  </TabsTrigger>
                  <TabsTrigger
                    value="odbc"
                    className="text-xs data-[state=active]:bg-accent/80 data-[state=active]:text-accent-foreground gap-1.5 px-2.5 h-7"
                  >
                    <Server className="h-3 w-3" />
                    ODBC
                  </TabsTrigger>
                  <TabsTrigger
                    value="openai"
                    className="text-xs data-[state=active]:bg-accent/80 data-[state=active]:text-accent-foreground gap-1.5 px-2.5 h-7"
                  >
                    <Sparkles className="h-3 w-3" />
                    OpenAI
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-subtle">
                <div className="p-4">
                  <TabsContent value="credentials" className="mt-0 space-y-6">
                    <CredentialSettings onCredentialsChange={onCredentialsChange} />
                    <OpenAICredentialSettings />
                  </TabsContent>
                  <TabsContent value="api" className="mt-0">
                    <ApiTester onResult={addResult} />
                  </TabsContent>
                  <TabsContent value="jdbc" className="mt-0">
                    <JdbcTester onResult={addResult} />
                  </TabsContent>
                  <TabsContent value="odbc" className="mt-0">
                    <OdbcTester onResult={addResult} />
                  </TabsContent>
                  <TabsContent value="openai" className="mt-0">
                    <OpenAiTester onResult={addResult} />
                  </TabsContent>
                </div>
              </div>
            </Tabs>

            {/* History Toggle */}
            {history.length > 0 && (
              <div className="border-t border-border/50 shrink-0">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full px-4 py-2 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    {history.length} test{history.length !== 1 ? 's' : ''} in history
                  </span>
                  {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showHistory && (
                  <div className="max-h-40 overflow-y-auto">
                    <TestHistory history={history} onClear={clearHistory} compact />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Draggable Floating Button */}
      <Draggable
        nodeRef={nodeRef}
        onStart={handleDragStart}
        onDrag={handleDrag}
        onStop={handleDragStop}
        bounds={{
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom
        }}
        position={position}
      >
        <div
          ref={nodeRef}
          onClick={handleButtonClick}
          className={cn(
            "fixed z-50",
            "w-11 h-11 rounded-full",
            // 3D effect with multiple layers
            "bg-gradient-to-b from-primary via-primary to-primary/80",
            "shadow-[0_4px_0_0_rgba(0,0,0,0.3),0_6px_12px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.2)]",
            // Hover state
            "hover:shadow-[0_3px_0_0_rgba(0,0,0,0.3),0_4px_8px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.25)]",
            "hover:translate-y-[1px]",
            // Active/pressed state  
            "active:shadow-[0_1px_0_0_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.15)]",
            "active:translate-y-[3px]",
            // Snap animation
            isSnapping && "transition-all duration-300 ease-out",
            // Cursor
            isDragging ? "cursor-grabbing" : "cursor-grab",
            // Hide when dialog is open
            isOpen && "opacity-0 pointer-events-none scale-90",
            // Flex center for icon
            "flex items-center justify-center"
          )}
          style={{ left: 0, top: 0 }}
          role="button"
          tabIndex={0}
          aria-label="Open Connection Tester"
        >
          {/* Inner highlight ring */}
          <span className="absolute inset-[2px] rounded-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
          
          {/* Icon */}
          <Zap className="h-5 w-5 text-primary-foreground relative z-10 drop-shadow-sm" />
          
          {/* Notification dot */}
          {history.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-red-500 border-2 border-card flex items-center justify-center shadow-md">
              <span className="text-[8px] font-bold text-white">
                {history.length > 9 ? '!' : history.length}
              </span>
            </span>
          )}
        </div>
      </Draggable>
    </>
  )
}
