// Every olympiad runs on its own timezone (an IANA name such as
// "Africa/Johannesburg"). The API stores round times as instants; these
// helpers read and write them as the olympiad's local calendar and clock, so
// everyone sees the same official times whatever their own device is set to.

export const DEFAULT_TIMEZONE = "Africa/Johannesburg";

// Offered when an organiser creates an olympiad. South Africa first; the
// rest cover the regions a school olympiad here is likely to reach.
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Africa/Johannesburg", label: "South Africa (SAST)" },
  { value: "Africa/Harare", label: "Zimbabwe, Zambia, Malawi (CAT)" },
  { value: "Africa/Nairobi", label: "Kenya, Tanzania, Uganda (EAT)" },
  { value: "Africa/Lagos", label: "Nigeria (WAT)" },
  { value: "Africa/Cairo", label: "Egypt" },
  { value: "UTC", label: "Coordinated Universal Time (UTC)" },
  { value: "Europe/London", label: "United Kingdom" },
  { value: "Asia/Kolkata", label: "India (IST)" },
];

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

// The wall-clock reading of an instant in a zone
function partsInZone(instant: number, timeZone: string): Parts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

// How far the zone's clock is ahead of UTC at an instant, in milliseconds
function zoneOffset(instant: number, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A <input type="datetime-local"> value ("2026-10-01T14:00"), read as a time
 * in the given zone, to the instant the API stores ("2026-10-01T12:00:00.000Z").
 */
export function zonedInputToIso(localValue: string, timeZone: string): string {
  const [date, time = "00:00"] = localValue.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  // The offset depends on the instant (daylight saving), so correct twice:
  // the first guess can sit on the other side of a clock change.
  let instant = asIfUtc - zoneOffset(asIfUtc, timeZone);
  instant = asIfUtc - zoneOffset(instant, timeZone);
  return new Date(instant).toISOString();
}

/** The reverse: an instant to a datetime-local value in the given zone. */
export function isoToZonedInput(iso: string, timeZone: string): string {
  const p = partsInZone(new Date(iso).getTime(), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "01 Oct 2026, 14:00 SAST": a moment, labelled with the zone. */
export function formatDateTimeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** "01 Oct 2026": the calendar date in the zone. */
export function formatDateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-ZA", { timeZone, day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

/** The zone's short name right now, e.g. "SAST", for labelling form fields. */
export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en-ZA", { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  return name ?? timeZone;
}
