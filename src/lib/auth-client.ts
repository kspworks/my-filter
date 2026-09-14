"use client";

import { createAuthClient } from "better-auth/react";

/** Same-origin by default, so no base URL needs configuring on the client. */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
