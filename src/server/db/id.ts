import { createId, isCuid } from "@paralleldrive/cuid2";

/** Primary key generator for every table, including better-auth's. */
export const newId = (): string => createId();

export { isCuid };
