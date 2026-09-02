import { maskWhatsAppNumber, formatReminderTime } from "./reminderDisplay";

describe("reminder display helpers", () => {
  test("masks Indian WhatsApp numbers in a privacy-friendly way", () => {
    expect(maskWhatsAppNumber("+91 62812 41187")).toBe("+91 XXXXXXX1187");
    expect(maskWhatsAppNumber("+91 9177596190")).toBe("+91 XXXXXXX6190");
    expect(maskWhatsAppNumber("6281241187")).toBe("+91 XXXXXXX1187");
  });

  test("formats reminder times to 12-hour IST display", () => {
    expect(formatReminderTime("04:00")).toBe("04:00 AM IST");
    expect(formatReminderTime("18:30")).toBe("06:30 PM IST");
  });
});
