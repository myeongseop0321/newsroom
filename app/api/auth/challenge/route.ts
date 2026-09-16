import { getPasswordChallenge } from "@/app/auth";

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email") || "";
  return Response.json(await getPasswordChallenge(email), { headers: { "Cache-Control": "no-store" } });
}
