import { env } from "~/env";
import {
  createTransport,
  readMailConfig,
} from "~/server/mail/create-transport";
import type { MailTransport } from "~/server/mail/transport";

/**
 * The only file here that touches `~/env`, and deliberately the only one no
 * test imports — everything worth asserting lives in `create-transport`.
 *
 * Built fresh per invocation rather than cached: the job runs once a day, so
 * there is no pool worth reusing across requests and a module-level cache would
 * only be a socket to leak.
 */
export function createMailTransport(): Promise<MailTransport> {
  return createTransport(readMailConfig(env));
}
