export const runtime = "nodejs"

export async function GET() {
  const supabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
      && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
      && process.env.SUPABASE_SECRET_KEY?.trim(),
  )
  const openzen = Boolean(process.env.OPENZEN_API_KEY?.trim())

  return Response.json(
    { supabase, openzen },
    { headers: { "Cache-Control": "private, max-age=60" } },
  )
}
