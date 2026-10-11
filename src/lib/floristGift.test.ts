import { describe, it, expect } from "vitest";
import { validateGift, FLORIST_TIME_SLOTS } from "./floristGift";

const base = { scheduledDate: "2026-10-12", scheduledSlot: "10:00–12:00" };
const today = "2026-10-11";

describe("presente floricultura", () => {
  it("turnos são de 2h", () => expect(FLORIST_TIME_SLOTS[0]).toBe("08:00–10:00"));
  it("presente sem destinatário é bloqueado", () =>
    expect(validateGift({ ...base, isGift: true }, today).length).toBeGreaterThan(0));
  it("presente com cartão exige mensagem", () =>
    expect(validateGift({ ...base, isGift: true, recipientName: "Ana", recipientPhone: "51999998888", cardIncluded: true }, today))
      .toContain("Escreva a mensagem do cartão."));
  it("uso próprio não exige destinatário", () => expect(validateGift({ ...base, isGift: false }, today)).toEqual([]));
  it("data passada é bloqueada", () =>
    expect(validateGift({ ...base, scheduledDate: "2026-10-10", isGift: false }, today).length).toBe(1));
});
