import {
  MAIL_TRANSPORTS,
  type MailTransport,
  type MailTransportName,
} from "~/server/mail/transport";

/**
 * Which transport to build, and with what.
 *
 * `readMailConfig` is pure and validates only the transport actually chosen.
 * That split is what lets `next build`, CI and a fresh clone run with no mail
 * secrets at all while a misconfigured Gmail still fails loudly — and it keeps
 * `~/env` out of the reach of every test but the ones that want it.
 */

export type MailConfig =
  | { transport: "log" }
  | { transport: "gmail"; user: string; appPassword: string; from: string };

export type MailEnvironment = {
  MAIL_TRANSPORT: MailTransportName;
  GMAIL_USER?: string;
  GMAIL_APP_PASSWORD?: string;
  MAIL_FROM?: string;
};

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is required when MAIL_TRANSPORT is "gmail". Generate an App Password at https://myaccount.google.com/apppasswords (the account needs 2-Step Verification).`,
    );
  }
  return value;
}

export function readMailConfig(env: MailEnvironment): MailConfig {
  switch (env.MAIL_TRANSPORT) {
    case "log":
      return { transport: "log" };
    case "gmail": {
      const user = required(env.GMAIL_USER, "GMAIL_USER");
      return {
        transport: "gmail",
        user,
        appPassword: required(env.GMAIL_APP_PASSWORD, "GMAIL_APP_PASSWORD"),
        // Gmail rewrites a From it does not own, so the account address is both
        // the only useful default and the only value that survives unchanged.
        from: env.MAIL_FROM ?? user,
      };
    }
    default: {
      // Unreachable while the union and MAIL_TRANSPORTS agree — which is the
      // point: adding a name without an arm is a type error, not a silent no-op.
      const unknown: never = env.MAIL_TRANSPORT;
      throw new Error(
        `Unknown MAIL_TRANSPORT ${JSON.stringify(unknown)}. Expected one of: ${MAIL_TRANSPORTS.join(", ")}.`,
      );
    }
  }
}

export async function createTransport(
  config: MailConfig,
): Promise<MailTransport> {
  if (config.transport === "gmail") {
    // Dynamic, so nodemailer is never loaded — nor bundled into any other
    // route's graph — unless Gmail is the transport actually in use.
    const { createGmailTransport } = await import(
      "~/server/mail/gmail-transport"
    );
    return createGmailTransport(config);
  }

  const { createLogTransport } = await import("~/server/mail/log-transport");
  return createLogTransport();
}
