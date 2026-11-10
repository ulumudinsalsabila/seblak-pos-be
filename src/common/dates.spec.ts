import { calendarDateRange, jakartaRange } from './dates';

describe('calendarDateRange', () => {
  it('selects the requested calendar dates inclusively', () => {
    expect(calendarDateRange('2026-11-10')).toEqual({
      gte: new Date('2026-11-10T00:00:00.000Z'),
      lte: new Date('2026-11-10T00:00:00.000Z'),
    });
    expect(calendarDateRange('2026-11-01', '2026-11-30')).toEqual({
      gte: new Date('2026-11-01T00:00:00.000Z'),
      lte: new Date('2026-11-30T00:00:00.000Z'),
    });
  });

  it('rejects datetimes', () => {
    expect(() => calendarDateRange('2026-11-10T10:00:00Z')).toThrow();
  });
});

describe('jakartaRange', () => {
  it('covers whole Jakarta days', () => {
    expect(jakartaRange('2026-11-10', '2026-11-11')).toEqual({
      gte: new Date('2026-11-09T17:00:00.000Z'),
      lt: new Date('2026-11-11T17:00:00.000Z'),
    });
  });
});
