import { NextRequest, NextResponse } from 'next/server'

const FASTAPI = process.env.FASTAPI_URL || 'http://127.0.0.1:8000'

type ApiPayload = { records?: unknown[]; clients?: unknown[]; count?: number; [key: string]: unknown }

function applyLimit(data: ApiPayload, limit: number): ApiPayload {
  const arr = data.records ?? data.clients
  if (!Array.isArray(arr) || arr.length <= limit) return data
  const sliced = arr.slice(0, limit)
  return data.records
    ? { ...data, records: sliced, count: sliced.length }
    : { ...data, clients: sliced, count: sliced.length }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  // Forward all search params except internal `limit` to FastAPI
  const searchParams = new URLSearchParams(request.nextUrl.searchParams)
  const limitParam = searchParams.get('limit')
  searchParams.delete('limit')
  const qs = searchParams.toString()
  const url = `${FASTAPI}/${path}${qs ? `?${qs}` : ''}`

  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    })
    const data = (await response.json()) as ApiPayload
    const limited = limitParam ? applyLimit(data, parseInt(limitParam, 10)) : data
    return NextResponse.json(limited)
  } catch {
    return NextResponse.json(
      { error: 'FastAPI not available', records: [], count: 0 },
      { status: 503 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const url = `${FASTAPI}/${path}`
  const body = await request.json().catch(() => undefined)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    })
    const data = await response.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'FastAPI not available' }, { status: 503 })
  }
}
