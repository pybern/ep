import { z } from "zod"

export const FocusCredentialsSchema = z.union([
  z.object({
    provider: z.literal("openzen"),
    model: z.string().min(1).max(200),
  }),
  z.object({
    provider: z.literal("manual").optional(),
    baseUrl: z.string().url().min(1).max(2_000),
    apiKey: z.string().min(1).max(8_000),
    model: z.string().min(1).max(200),
    urlMode: z.enum(["base", "endpoint"]).optional(),
    skipSslVerify: z.boolean().optional(),
  }),
])

export const FocusColumnSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
})

export const FocusRunResultSchema = z.object({
  columns: z.array(FocusColumnSchema).min(1),
  rows: z.array(z.record(z.string(), z.unknown())).min(1),
  summary: z.string().min(1),
  warnings: z.array(z.string()).optional(),
  rawResponse: z.string().optional(),
})

export const FocusRunRequestSchema = z.object({
  language: z.string().min(1),
  code: z.string().min(1),
  intent: z.string().optional(),
  seed: z.number().int().optional(),
  rowLimit: z.number().int().min(1).max(500).optional(),
  credentials: FocusCredentialsSchema,
})

export const FocusChartTypeSchema = z.enum(["bar", "line", "area", "pie", "scatter"])

export const FocusChartSpecSchema = z.object({
  chartType: FocusChartTypeSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  xKey: z.string().optional(),
  yKeys: z.array(z.string()).optional(),
  categoryKey: z.string().optional(),
  valueKey: z.string().optional(),
})

export const FocusBuildResultSchema = z.object({
  chartSpec: FocusChartSpecSchema,
  chartCode: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  rawResponse: z.string().optional(),
})

export const FocusBuildRequestSchema = z.object({
  runResult: FocusRunResultSchema,
  userPreference: z.string().optional(),
  theme: z.enum(["light", "dark"]).optional(),
  credentials: FocusCredentialsSchema,
})

export type FocusCredentials = z.infer<typeof FocusCredentialsSchema>
export type FocusRunResult = z.infer<typeof FocusRunResultSchema>
export type FocusBuildResult = z.infer<typeof FocusBuildResultSchema>
