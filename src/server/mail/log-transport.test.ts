import { describe, expect, it, vi } from "vitest";
import { createLogTransport } from "~/server/mail/log-transport";

describe("createLogTransport", () => {
  it("writes enough to tell what would have been sent", async () => {
    const write = vi.fn();

    await createLogTransport(write).send({
      to: "alice@example.com",
      subject: "1 cartridge needs replacing",
      text: "Replace now\n- «Sediment PP» — due today",
      html: "<p>ignored here</p>",
    });

    const line = write.mock.calls[0]?.[0] as string;
    expect(line).toContain("alice@example.com");
    expect(line).toContain("1 cartridge needs replacing");
    // The text part, not the HTML: this is read in a terminal.
    expect(line).toContain("«Sediment PP» — due today");
    expect(line).not.toContain("<p>");
  });
});
