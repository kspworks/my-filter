import { Droplets } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "~/server/auth";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Droplets className="size-6 text-primary" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">
            My Filter
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
