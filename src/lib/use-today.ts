"use client";

import { useState } from "react";
import { todayString } from "~/lib/due-date";

/**
 * "Today" according to the person looking at the screen.
 *
 * Deliberately client-side: the server's timezone is not the user's, and a due
 * date computed there can be a day off. Held in state so a long-lived tab keeps
 * a stable reference date instead of shifting mid-interaction.
 */
export function useToday(): string {
  const [today] = useState(todayString);
  return today;
}
