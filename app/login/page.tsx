import { getAppUser, safeReturnPath } from "@/app/auth";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.return_to);
  if (await getAppUser()) redirect(returnTo);
  return <LoginForm returnTo={returnTo} />;
}
