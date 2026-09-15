// @ts-nocheck
const cache = new Map();

async function getHolidaysForYear(year) {
  if (cache.has(year)) return cache.get(year);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[holidays] API returned ${res.status} for year ${year}`);
      return [];
    }

    const holidays = await res.json();
    cache.set(year, holidays);
    return holidays;
  } catch (err) {
    clearTimeout(timeout);
    console.error(`[holidays] fetch failed for year ${year}: ${err.message}`);
    return [];
  }
}

async function checkDatesForHolidays(dates) {
  const warnings = [];
  const years = [...new Set(dates.map((d) => d.getUTCFullYear()))];

  const holidaysByYear = await Promise.all(
    years.map(async (year) => ({ year, holidays: await getHolidaysForYear(year) })),
  );

  const allHolidays = holidaysByYear.flatMap(({ holidays }) => holidays);

  for (const date of dates) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    const match = allHolidays.find((h) => h.date === dateStr);
    if (match) {
      warnings.push(`${dateStr} falls on a public holiday: ${match.name}`);
    }
  }

  return warnings;
}

module.exports = { checkDatesForHolidays };
