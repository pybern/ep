const JSON_RENDER_FENCE =
  /```(?:spec|json-render)[ \t]*(?:\n[\s\S]*?(?:```|$)|$)/gi

export function sanitizeAiMarkdown(content: string): string {
  return content
    .replace(JSON_RENDER_FENCE, "")
    .replace(/```[^\n`]*$/, "```")
}
