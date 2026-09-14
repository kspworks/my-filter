import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppNav } from "~/components/app-nav";
import { auth } from "~/server/auth";

/**
 * The authoritative gate. There is deliberately no middleware doing an optimistic
 * cookie check: the session is verified here against the database, and every tRPC
 * procedure verifies it again, so a stale cookie can never reveal data.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav userName={session.user.name} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
