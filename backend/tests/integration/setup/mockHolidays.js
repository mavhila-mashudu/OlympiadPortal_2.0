// The round schedule check asks a public-holiday API (date.nager.at) whether a
// round opens or closes on a holiday. Tests must not depend on the internet,
// so it is replaced everywhere with "no holidays".
//
// A test that cares about the warnings can override it:
//   const { checkDatesForHolidays } = require("../../src/services/holidayService");
//   checkDatesForHolidays.mockResolvedValueOnce(["..."]);
jest.mock("../../../src/services/holidayService", () => ({
  checkDatesForHolidays: jest.fn().mockResolvedValue([]),
}));

const { checkDatesForHolidays } = require("../../../src/services/holidayService");

beforeEach(() => {
  checkDatesForHolidays.mockClear();
  checkDatesForHolidays.mockResolvedValue([]);
});
