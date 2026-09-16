import { AuthError, loginUser } from "@/app/auth";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { email?: unknown; passwordVerifier?: unknown };
    if (typeof input.email !== "string" || typeof input.passwordVerifier !== "string") {
      throw new AuthError(400, "이메일과 비밀번호를 입력해 주세요.");
    }
    const { user, cookie } = await loginUser({ email: input.email, passwordVerifier: input.passwordVerifier });
    return Response.json(
      { user: { name: user.displayName, email: user.email } },
      { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof AuthError ? error.message : "로그인 중 문제가 발생했습니다.";
    return Response.json({ error: message }, { status });
  }
}
