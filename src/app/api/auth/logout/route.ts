import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/settings";

function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST(request: Request) {
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    return clearSession(NextResponse.redirect(new URL("/login?reason=locked", request.url)));
  }
  return clearSession(NextResponse.json({ ok: true }));
}

export async function GET(request: Request) {
  return clearSession(NextResponse.redirect(new URL("/login?reason=locked", request.url)));
}
