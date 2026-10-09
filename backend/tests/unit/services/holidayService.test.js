// Holidays come from the public Nager.Date API (South Africa); fetch is faked
const holidays = {
    2026: [
        { date: '2026-06-16', name: 'Youth Day' },
        { date: '2026-12-16', name: 'Day of Reconciliation' },
    ],
    2027: [{ date: '2027-01-01', name: "New Year's Day" }],
};

let checkDatesForHolidays;
beforeEach(() => {
    jest.resetModules(); // the service caches each year's list
    global.fetch = jest.fn(async (url) => {
        const year = Number(url.split('/').at(-2));
        return { ok: true, json: async () => holidays[year] ?? [] };
    });
    ({
        checkDatesForHolidays,
    } = require('../../../src/services/holidayService'));
});
afterEach(() => {
    delete global.fetch;
});

describe('checkDatesForHolidays', () => {
    it('warns about a date that falls on a public holiday', async () => {
        expect(
            await checkDatesForHolidays([
                new Date('2026-06-16T08:00:00Z'),
                new Date('2026-06-17T08:00:00Z'),
            ])
        ).toEqual(['2026-06-16 falls on a public holiday: Youth Day']);
    });

    it("reads each date on the olympiad's own calendar", async () => {
        // 00:30 on Youth Day in Johannesburg is 22:30 the day before in UTC
        const justAfterMidnight = new Date('2026-06-15T22:30:00Z');

        expect(
            await checkDatesForHolidays(
                [justAfterMidnight],
                'Africa/Johannesburg'
            )
        ).toEqual(['2026-06-16 falls on a public holiday: Youth Day']);
        expect(await checkDatesForHolidays([justAfterMidnight], 'UTC')).toEqual(
            []
        );
    });

    it('uses South African time when no zone is given', async () => {
        expect(
            await checkDatesForHolidays([new Date('2026-06-15T22:30:00Z')])
        ).toHaveLength(1);
    });

    it("looks up the local year, which can differ from UTC's at new year", async () => {
        // 01:00 on 1 January 2027 in Johannesburg is still 2026 in UTC
        expect(
            await checkDatesForHolidays(
                [new Date('2026-12-31T23:00:00Z')],
                'Africa/Johannesburg'
            )
        ).toEqual(["2027-01-01 falls on a public holiday: New Year's Day"]);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/2027/ZA'),
            expect.anything()
        );
    });

    it("gives no warnings when the holiday list can't be fetched", async () => {
        global.fetch = jest.fn(async () => ({ ok: false, status: 503 }));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(
            await checkDatesForHolidays([new Date('2026-06-16T08:00:00Z')])
        ).toEqual([]);
    });
});
