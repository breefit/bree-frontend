export const maskWhatsAppNumber = (phone) => {
  if (!phone) return "";

  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";

  const normalizedDigits = digits.startsWith("91") ? digits.slice(2) : digits;
  const lastFour = normalizedDigits.slice(-4) || "0000";

  return `+91 ${"X".repeat(7)}${lastFour}`;
};

export const formatReminderTime = (time) => {
  if (!time) return "";

  const [hours, minutes] = String(time).trim().split(":");
  if (hours === undefined || minutes === undefined) {
    return String(time).trim();
  }

  const hour = Number(hours);
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour >= 12 ? "PM" : "AM";

  return `${String(displayHour).padStart(2, "0")}:${minutes} ${ampm} IST`;
};
