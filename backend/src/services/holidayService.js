// @ts-nocheck
const { DEFAULT_TIMEZONE, localDate } = require("../utils/timezones");

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

// Public holidays are calendar days, so compare each instant's date in the
// olympiad's own timezone: 00:30 on a holiday in Johannesburg is still the
// previous day in UTC.
async function checkDatesForHolidays(dates, timeZone = DEFAULT_TIMEZONE) {
  const warnings = [];
  const dateStrings = dates.map((date) => localDate(date, timeZone));
  const years = [...new Set(dateStrings.map((d) => Number(d.slice(0, 4))))];

  const holidaysByYear = await Promise.all(
    years.map(async (year) => ({ year, holidays: await getHolidaysForYear(year) })),
  );

  const allHolidays = holidaysByYear.flatMap(({ holidays }) => holidays);

  for (const dateStr of dateStrings) {
    const match = allHolidays.find((h) => h.date === dateStr);
    if (match) {
      warnings.push(`${dateStr} falls on a public holiday: ${match.name}`);
    }
  }

  return warnings;
}

module.exports = { checkDatesForHolidays };
