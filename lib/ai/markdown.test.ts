import { describe, expect, it } from "vitest"

import { sanitizeAiMarkdown } from "./markdown"

describe("sanitizeAiMarkdown", () => {
  it("removes completed json-render spec fences", () => {
    expect(sanitizeAiMarkdown(
      "Answer text\n\n```spec\n{\"op\":\"add\",\"path\":\"/root\"}\n```\n",
    )).toBe("Answer text\n\n\n")
  })

  it("removes an incomplete streamed spec fence", () => {
    expect(sanitizeAiMarkdown(
      "Answer text\n\n```spec\n{\"op\":\"add\"",
    )).toBe("Answer text\n\n")
  })
})
