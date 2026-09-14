import { clearSessionCookie, logoutSession, safeReturnPath } from "@/app/auth";

export async function GET(request: Request) {
  await logoutSession(request.headers.get("cookie"));
  const requestUrl = new URL(request.url);
  const destination = safeReturnPath(requestUrl.searchParams.get("return_to"));
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(destination, request.url).toString(),
      "Set-Cookie": clearSessionCookie(),
      "Cache-Control": "no-store",
    },
  });
}
