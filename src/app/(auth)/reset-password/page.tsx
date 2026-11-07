import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "~/components/auth/reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("resetPassword") };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await searchParams;
  // better-auth redirects here with `?error=INVALID_TOKEN` instead of a token
  // when the link is stale, so no token and a bad token read the same.
  return <ResetPasswordForm token={typeof token === "string" ? token : null} />;
}
