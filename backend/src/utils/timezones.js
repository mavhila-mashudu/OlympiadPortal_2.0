// Every olympiad runs on its own timezone (olympiads.timezone, an IANA name
// such as "Africa/Johannesburg"). Round times are stored as instants; these
// helpers read those instants as the olympiad's local calendar and clock.

const DEFAULT_TIMEZONE = 'Africa/Johannesburg';

// A real IANA zone the runtime can format in. (Intl.supportedValuesOf leaves
// out some valid names, such as "UTC", so try the zone itself.) Newer Intl
// also accepts bare offsets like "+02:00", which older browsers reject and
// which ignore daylight saving, so only names are allowed.
function isValidTimeZone(timeZone) {
    if (
        typeof timeZone !== 'string' ||
        !/^[A-Za-z]+(\/[A-Za-z0-9_+-]+)*$/.test(timeZone)
    )
        return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
        return true;
    } catch {
        return false;
    }
}

// The olympiad-local calendar date of an instant, as "YYYY-MM-DD"
function localDate(date, timeZone = DEFAULT_TIMEZONE) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

// An instant written for people, e.g. "01 Oct 2026, 14:00 SAST"
function formatInTimeZone(date, timeZone = DEFAULT_TIMEZONE) {
    return new Intl.DateTimeFormat('en-ZA', {
        timeZone,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZoneName: 'short',
    }).format(date);
}

module.exports = {
    DEFAULT_TIMEZONE,
    isValidTimeZone,
    localDate,
    formatInTimeZone,
};
