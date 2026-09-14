import { AuthError, registerUser } from "@/app/auth";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as {
      email?: unknown;
      password?: unknown;
      displayName?: unknown;
    };
    if (
      typeof input.email !== "string" ||
      typeof input.password !== "string" ||
      typeof input.displayName !== "string"
    ) {
      throw new AuthError(400, "이름, 이메일, 비밀번호를 모두 입력해 주세요.");
    }
    const { user, cookie } = await registerUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
    });
    return Response.json(
      { user: { name: user.displayName, email: user.email } },
      { status: 201, headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof AuthError ? error.message : "회원가입 중 문제가 발생했습니다.";
    return Response.json({ error: message }, { status });
  }
}
