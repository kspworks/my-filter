import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "~/i18n/locale";
import { loadMessages } from "~/i18n/messages";
import { KNOWN_CODES } from "~/lib/auth-errors";
import { CONSUMABLE_TYPES, INTERVAL_UNITS } from "~/lib/consumables";
import type { DueStatus } from "~/lib/due-date";
import { PRESET_ITEM_KEYS, PRESETS } from "~/lib/presets";

/**
 * `messages.test.ts` proves the two catalogues agree with each other. It cannot
 * prove they agree with the code: adding a consumable type, a preset or an auth
 * error code without a label passes every other test and then renders a raw key
 * to a user. This closes that gap from the other direction.
 */

type MessageTree = { [key: string]: string | MessageTree };

function read(
  tree: MessageTree,
  path: string,
): string | MessageTree | undefined {
  return path
    .split(".")
    .reduce<string | MessageTree | undefined>(
      (node, segment) =>
        node && typeof node === "object" ? node[segment] : undefined,
      tree,
    );
}

const DUE_STATUSES: DueStatus[] = ["overdue", "due_soon", "ok"];

/** Every key the code can ask for, derived from the code rather than listed. */
function requiredKeys(): string[] {
  return [
    ...CONSUMABLE_TYPES.map((type) => `consumableType.${type}`),
    ...INTERVAL_UNITS.map((unit) => `intervalUnit.${unit}`),
    // `useLabels().interval` renders a count through these, so both families
    // of key exist per unit.
    ...INTERVAL_UNITS.map((unit) => `interval.${unit}`),
    ...DUE_STATUSES.map((status) => `dueStatus.${status}`),
    ...PRESETS.flatMap((preset) => [
      `presets.sets.${preset.id}.name`,
      `presets.sets.${preset.id}.description`,
    ]),
    ...PRESET_ITEM_KEYS.map((key) => `presets.items.${key}`),
    ...KNOWN_CODES.map((code) => `auth.errors.${code}`),
  ];
}

describe.each(LOCALES)("the %s catalogue", (locale: Locale) => {
  it("has a message for every value the code can render", async () => {
    const messages = (await loadMessages(locale)) as MessageTree;

    const missing = requiredKeys().filter(
      (key) => typeof read(messages, key) !== "string",
    );

    expect(missing).toEqual([]);
  });
});

describe("preset definitions", () => {
  it("only names cartridges that are declared preset items", () => {
    const declared = new Set<string>(PRESET_ITEM_KEYS);
    const used = PRESETS.flatMap((preset) =>
      preset.items.map((item) => item.nameKey),
    );

    expect(used.filter((key) => !declared.has(key))).toEqual([]);
  });

  it("uses every declared preset item in at least one set", () => {
    const used = new Set(
      PRESETS.flatMap((preset) => preset.items.map((item) => item.nameKey)),
    );

    // An unused key is dead weight that still has to be translated twice.
    expect(PRESET_ITEM_KEYS.filter((key) => !used.has(key))).toEqual([]);
  });
});
