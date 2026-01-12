import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { streamText, convertToModelMessages, type UIMessage, type ModelMessage } from "ai"
import { Agent, fetch as undiciFetch } from "undici"

export const runtime = "nodejs"
export const maxDuration = 60

// Create a reusable agent for SSL bypass
const insecureAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
})

interface ColumnInfo {
  name: string
  type: string
  note?: string
}

interface TableContext {
  path: string
  columns: ColumnInfo[]
  description?: string
  tags?: string[]
}

interface ContainerContext {
  path: string
  type: string
  childDatasets: TableContext[]
}

interface DataContext {
  tables?: TableContext[]
  containers?: ContainerContext[]
  workspaceName?: string
  workspaceDescription?: string
}

/**
 * Format a table with its notes for the system prompt
 */
function formatTableForPrompt(table: TableContext): string {
  let result = `#### \`${table.path}\`\n`
  
  // Add table description if available
  if (table.description) {
    result += `**Description:** ${table.description}\n\n`
  }
  
  // Add tags if available
  if (table.tags && table.tags.length > 0) {
    result += `**Tags:** ${table.tags.join(", ")}\n\n`
  }
  
  // Add columns
  if (table.columns.length > 0) {
    // Check if any columns have notes
    const hasNotes = table.columns.some(col => col.note)
    
    if (hasNotes) {
      result += `| Column | Type | Description |\n|--------|------|-------------|\n`
      for (const col of table.columns) {
        result += `| ${col.name} | ${col.type} | ${col.note || "-"} |\n`
      }
    } else {
      result += `| Column | Type |\n|--------|------|\n`
      for (const col of table.columns) {
        result += `| ${col.name} | ${col.type} |\n`
      }
    }
  } else {
    result += `(Column information not available)\n`
  }
  
  result += `\n`
  return result
}

/**
 * Build a comprehensive system prompt for the SQL assistant with schema context
 */
function buildSystemPrompt(dataContext?: DataContext): string {
  const basePrompt = `You are an expert SQL assistant specialized in helping users discover data and build queries for Dremio. You have deep knowledge of SQL syntax, query optimization, and data analysis best practices.

Your primary capabilities:
1. **Data Discovery**: Describe available tables, columns, and their data types to help users understand their data
2. **Query Building**: Write efficient SQL queries including SELECT, JOIN, GROUP BY, window functions, CTEs, subqueries, and more
3. **Query Optimization**: Suggest performance improvements and best practices
4. **Data Analysis**: Help users formulate analytical approaches and data exploration strategies
5. **Debugging**: Identify and fix SQL errors

Guidelines:
- Always use proper SQL formatting with clear indentation
- Prefer explicit JOINs over implicit ones
- Use meaningful aliases for tables and columns
- Add comments for complex query logic when helpful
- Consider performance implications and suggest optimizations when relevant
- When referencing tables, use the full qualified path (e.g., source.schema.table)
- Be proactive in describing available data when the user asks about what data is available
- Pay attention to table and column descriptions provided by the user - they contain important business context`

  if (!dataContext || (!dataContext.tables?.length && !dataContext.containers?.length)) {
    return basePrompt + `

Note: No specific data context has been provided. The user has not selected any tables or folders in the sidebar. You can:
- Ask the user to select tables/folders in the sidebar to get schema information
- Ask the user to describe their data schema manually
- Provide general SQL guidance without specific table references`
  }

  // Build schema context from selected items
  let schemaContext = `

## Available Data Schema

The user has selected the following items for context. Use this information to write accurate queries and help them understand their data.

`

  // Add workspace context if available
  if (dataContext.workspaceName) {
    schemaContext += `**Workspace:** ${dataContext.workspaceName}\n`
    if (dataContext.workspaceDescription) {
      schemaContext += `**Workspace Notes:** ${dataContext.workspaceDescription}\n`
    }
    schemaContext += `\n`
  }

  // Add directly selected tables
  if (dataContext.tables && dataContext.tables.length > 0) {
    schemaContext += `### Selected Tables\n\n`
    
    for (const table of dataContext.tables) {
      schemaContext += formatTableForPrompt(table)
    }
  }

  // Add container contexts with their child datasets
  if (dataContext.containers && dataContext.containers.length > 0) {
    schemaContext += `### Selected Folders/Sources\n\n`
    
    for (const container of dataContext.containers) {
      schemaContext += `#### ${container.type}: \`${container.path}\`\n\n`
      
      if (container.childDatasets && container.childDatasets.length > 0) {
        schemaContext += `Contains ${container.childDatasets.length} dataset(s):\n\n`
        
        for (const dataset of container.childDatasets) {
          schemaContext += `##### \`${dataset.path}\`\n`
          
          // Add table description if available
          if (dataset.description) {
            schemaContext += `**Description:** ${dataset.description}\n\n`
          }
          
          // Add tags if available
          if (dataset.tags && dataset.tags.length > 0) {
            schemaContext += `**Tags:** ${dataset.tags.join(", ")}\n\n`
          }
          
          if (dataset.columns.length > 0) {
            const hasNotes = dataset.columns.some(col => col.note)
            
            if (hasNotes) {
              schemaContext += `| Column | Type | Description |\n|--------|------|-------------|\n`
              for (const col of dataset.columns) {
                schemaContext += `| ${col.name} | ${col.type} | ${col.note || "-"} |\n`
              }
            } else {
              schemaContext += `| Column | Type |\n|--------|------|\n`
              for (const col of dataset.columns) {
                schemaContext += `| ${col.name} | ${col.type} |\n`
              }
            }
          } else {
            schemaContext += `(Column information not available)\n`
          }
          schemaContext += `\n`
        }
      } else {
        schemaContext += `(No datasets found or loading...)\n\n`
      }
    }
  }

  // Add helpful guidance
  schemaContext += `---

**Usage Notes:**
- Reference these exact table and column names when generating SQL
- Pay special attention to table and column descriptions - they contain business context that helps you understand the data semantics
- You can suggest JOINs between tables based on column names that appear related
- When asked "what data do I have?" or similar, list and describe the available tables and columns, including their descriptions
- If the user asks about columns or tables not in this context, let them know they may need to select additional items in the sidebar`

  return basePrompt + schemaContext
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { messages, baseUrl, apiKey, model, skipSslVerify, dataContext } = body

    if (!baseUrl || !apiKey || !model) {
      return new Response(
        JSON.stringify({ error: "Missing required credentials (baseUrl, apiKey, model)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }
    
    // Convert messages from UI format (with parts) to model format (with content)
    const modelMessages = await convertToModelMessages(messages as UIMessage[])
    
    // Build the system prompt with data context
    const systemPrompt = buildSystemPrompt(dataContext as DataContext | undefined)
    
    // Log context info for debugging - detailed logging to verify data transmission
    const tableCount = dataContext?.tables?.length || 0
    const containerCount = dataContext?.containers?.length || 0
    const totalColumns = (dataContext?.tables || []).reduce((sum: number, t: TableContext) => sum + t.columns.length, 0) +
      (dataContext?.containers || []).reduce((sum: number, c: ContainerContext) => 
        sum + (c.childDatasets || []).reduce((s: number, d: TableContext) => s + d.columns.length, 0), 0)
    
    // Count tables with notes
    const tablesWithNotes = (dataContext?.tables || []).filter((t: TableContext) => t.description).length +
      (dataContext?.containers || []).reduce((sum: number, c: ContainerContext) => 
        sum + (c.childDatasets || []).filter((d: TableContext) => d.description).length, 0)
    
    // Count columns with notes
    const columnsWithNotes = (dataContext?.tables || []).reduce((sum: number, t: TableContext) => 
      sum + t.columns.filter((c: ColumnInfo) => c.note).length, 0) +
      (dataContext?.containers || []).reduce((sum: number, c: ContainerContext) => 
        sum + (c.childDatasets || []).reduce((s: number, d: TableContext) => 
          s + d.columns.filter((col: ColumnInfo) => col.note).length, 0), 0)
    
    console.log(`[Chat API] ═══════════════════════════════════════════════════════`)
    console.log(`[Chat API] 📥 Request received`)
    console.log(`[Chat API] Data context summary: ${tableCount} tables, ${containerCount} containers, ${totalColumns} total columns`)
    console.log(`[Chat API] Notes: ${tablesWithNotes} tables with descriptions, ${columnsWithNotes} columns with notes`)
    
    if (dataContext?.workspaceName) {
      console.log(`[Chat API] Workspace: "${dataContext.workspaceName}"${dataContext.workspaceDescription ? ' (has description)' : ''}`)
    }
    
    if (tableCount > 0 || containerCount > 0) {
      console.log(`[Chat API] Tables: ${dataContext?.tables?.map((t: TableContext) => t.path).join(', ') || 'none'}`)
      console.log(`[Chat API] Containers: ${dataContext?.containers?.map((c: ContainerContext) => c.path).join(', ') || 'none'}`)
      
      // Log column details for verification
      if (dataContext?.tables) {
        for (const table of dataContext.tables) {
          const noteIndicator = table.description ? ' 📝' : ''
          console.log(`[Chat API]   └─ ${table.path}${noteIndicator}: [${table.columns.map((c: ColumnInfo) => c.name).join(', ')}]`)
        }
      }
    } else {
      console.log(`[Chat API] ⚠ No data context provided - assistant will have limited schema knowledge`)
    }
    
    // Log system prompt size to verify schema was included
    console.log(`[Chat API] System prompt size: ${systemPrompt.length} chars`)
    console.log(`[Chat API] ═══════════════════════════════════════════════════════`)
    
    // Prepend system message
    const messagesWithSystem: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...modelMessages
    ]

    // Normalize base URL - ensure it ends with /v1
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "")
    if (!normalizedBaseUrl.endsWith("/v1")) {
      normalizedBaseUrl = `${normalizedBaseUrl}/v1`
    }

    // Create a custom fetch for SSL verification bypass if needed
    const customFetch = skipSslVerify
      ? async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url
          
          // Convert headers to a plain object if needed
          let headers: Record<string, string> = {}
          if (init?.headers) {
            if (init.headers instanceof Headers) {
              init.headers.forEach((value, key) => {
                headers[key] = value
              })
            } else if (Array.isArray(init.headers)) {
              for (const [key, value] of init.headers) {
                headers[key] = value
              }
            } else {
              headers = init.headers as Record<string, string>
            }
          }

          const response = await undiciFetch(url, {
            method: init?.method || "GET",
            headers,
            body: init?.body as string | undefined,
            dispatcher: insecureAgent,
          })
          
          return response as unknown as Response
        }
      : undefined

    // Create the OpenAI compatible provider
    const provider = createOpenAICompatible({
      name: "custom-openai",
      apiKey,
      baseURL: normalizedBaseUrl,
      fetch: customFetch,
    })

    // Stream the response using the messages with system prompt
    const result = streamText({
      model: provider(model),
      messages: messagesWithSystem,
      temperature: 0.7,
    })

    // Return the streaming response
    return result.toTextStreamResponse()
  } catch (error) {
    console.error("[Chat API] Error:", error instanceof Error ? error.message : String(error))
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
