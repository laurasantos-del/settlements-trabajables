import { NextRequest, NextResponse } from "next/server";

const FASTAPI = process.env.FASTAPI_URL || "http://127.0.0.1:8000";

function targetUrl(path: string[], request: NextRequest) {
  const joined = path.join("/");
  const query = request.nextUrl.searchParams.toString();
  return `${FASTAPI}/${joined}${query ? `?${query}` : ""}`;
}

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  try {
    const response = await fetch(targetUrl(params.path, request), { cache: "no-store" });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("FastAPI proxy GET failed", error);
    return NextResponse.json({ records: [], count: 0, error: true }, { status: 503 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  try {
    const body = await request.text();
    const response = await fetch(targetUrl(params.path, request), {
      method: "POST",
      headers: { "Content-Type": request.headers.get("Content-Type") ?? "application/json" },
      body: body || undefined,
      cache: "no-store"
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("FastAPI proxy POST failed", error);
    return NextResponse.json({ records: [], count: 0, error: true }, { status: 503 });
  }
}
