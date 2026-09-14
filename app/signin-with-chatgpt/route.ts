import { safeReturnPath, signInPath } from "@/app/auth";

export function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get("return_to"));
  return Response.redirect(new URL(signInPath(returnTo), request.url), 302);
}
