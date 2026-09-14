import "dotenv/config";

import { subDays, subMonths } from "date-fns";
import { eq } from "drizzle-orm";
import type { ConsumableType, IntervalUnit } from "~/lib/consumables";
import { toDateString } from "~/lib/due-date";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  consumableReplacements,
  consumables,
  systems,
} from "~/server/db/schema/app";
import { user } from "~/server/db/schema/auth";

/**
 * Creates a demo account with systems whose cartridges are deliberately in mixed
 * states — overdue, due soon and fine — so the dashboard has something to show.
 *
 * Re-runnable: the demo user is deleted first, and every dependent row cascades.
 */

const DEMO_EMAIL = "demo@myfilter.app";
const DEMO_PASSWORD = "demo-password";

const today = new Date();
const daysAgo = (days: number) => toDateString(subDays(today, days));
const monthsAgo = (months: number, days = 0) =>
  toDateString(subDays(subMonths(today, months), days));

type SeedConsumable = {
  type: ConsumableType;
  name: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  lastChangedOn: string;
  extraHistory?: string[];
};

async function addConsumable(
  userId: string,
  systemId: string | null,
  item: SeedConsumable,
) {
  const [created] = await db
    .insert(consumables)
    .values({
      userId,
      systemId,
      type: item.type,
      name: item.name,
      intervalValue: item.intervalValue,
      intervalUnit: item.intervalUnit,
      lastChangedOn: item.lastChangedOn,
    })
    .returning({ id: consumables.id });

  if (!created) throw new Error(`Failed to create ${item.name}`);

  const history = [...(item.extraHistory ?? []), item.lastChangedOn];
  await db.insert(consumableReplacements).values(
    history.map((changedOn) => ({
      consumableId: created.id,
      userId,
      changedOn,
      // Matches what the app writes: which entry is the installation and which
      // is the most recent is derived from position when rendering, so no
      // display text goes into the log.
      note: null,
    })),
  );
}

async function main() {
  await db.delete(user).where(eq(user.email, DEMO_EMAIL));

  const signUp = await auth.api.signUpEmail({
    body: { name: "demo", email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  const userId = signUp.user.id;

  const [kitchen] = await db
    .insert(systems)
    .values({
      userId,
      manufacturer: "Aquafilter",
      model: "RO-6 Standard",
      installedOn: monthsAgo(26),
      notes: "Under the kitchen sink",
    })
    .returning({ id: systems.id });

  const [bathroom] = await db
    .insert(systems)
    .values({
      userId,
      manufacturer: "Ecosoft",
      model: "P'URE Balance",
      installedOn: monthsAgo(8),
    })
    .returning({ id: systems.id });

  if (!kitchen || !bathroom) throw new Error("Failed to create systems");

  const kitchenItems: SeedConsumable[] = [
    {
      type: "sediment",
      name: "Sediment PP 5 micron",
      intervalValue: 6,
      intervalUnit: "months",
      lastChangedOn: monthsAgo(8),
      extraHistory: [monthsAgo(26), monthsAgo(19), monthsAgo(14)],
    },
    {
      type: "carbon_gac",
      name: "Granular activated carbon",
      intervalValue: 6,
      intervalUnit: "months",
      lastChangedOn: monthsAgo(6, -8),
    },
    {
      type: "carbon_block",
      name: "Carbon block CTO",
      intervalValue: 6,
      intervalUnit: "months",
      lastChangedOn: monthsAgo(1),
    },
    {
      type: "membrane",
      name: "RO membrane 50 GPD",
      intervalValue: 24,
      intervalUnit: "months",
      lastChangedOn: monthsAgo(20),
    },
    {
      type: "post_carbon",
      name: "Inline post carbon",
      intervalValue: 12,
      intervalUnit: "months",
      lastChangedOn: monthsAgo(12, -5),
    },
  ];

  const bathroomItems: SeedConsumable[] = [
    {
      type: "sediment",
      name: "Sediment PP 5 micron",
      intervalValue: 6,
      intervalUnit: "months",
      lastChangedOn: monthsAgo(2),
    },
    {
      type: "membrane",
      name: "RO membrane 75 GPD",
      intervalValue: 24,
      intervalUnit: "months",
      lastChangedOn: monthsAgo(8),
    },
    {
      type: "mineralizer",
      name: "Mineralizer",
      intervalValue: 300,
      intervalUnit: "days",
      lastChangedOn: daysAgo(295),
    },
  ];

  for (const item of kitchenItems) {
    await addConsumable(userId, kitchen.id, item);
  }
  for (const item of bathroomItems) {
    await addConsumable(userId, bathroom.id, item);
  }

  await addConsumable(userId, null, {
    type: "sediment",
    name: "Spare sediment PP (boxed)",
    intervalValue: 6,
    intervalUnit: "months",
    lastChangedOn: daysAgo(0),
  });

  console.log(`Seeded ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("  2 systems, 9 consumables (one unassigned)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
