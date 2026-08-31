import { describe, it, expect } from "vitest";
import {
  createAdminSessionToken,
  verifyAdminPassword,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";

describe("admin auth", () => {
  it("accepts the configured admin password", () => {
    expect(verifyAdminPassword("CoW@g$2020$")).toBe(true);
    expect(verifyAdminPassword("wrong")).toBe(false);
  });

  it("creates and verifies a session token", async () => {
    const token = await createAdminSessionToken();
    expect(await verifyAdminSessionToken(token)).toBe(true);
    expect(await verifyAdminSessionToken("invalid.token")).toBe(false);
  });
});
