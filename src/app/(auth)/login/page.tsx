import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "~/components/auth/login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("signIn") };
}

export default function LoginPage() {
  return <LoginForm />;
}
