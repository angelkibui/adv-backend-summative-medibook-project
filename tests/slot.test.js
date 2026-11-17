// Part F — slot validation tests (pure function: no MySQL, no Redis).
// Policy: future, 30-minute boundary, start between 09:00 and 16:30 inclusive.
const { validateSlot } = require('../src/utils/slot');

// Builds a Date three days in the future at the given local time.
function futureAt(hours, minutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

describe('validateSlot', () => {
  test('accepts a valid future slot (10:00)', () => {
    expect(validateSlot(futureAt(10, 0)).ok).toBe(true);
  });

  test('accepts the first slot of the day (09:00)', () => {
    expect(validateSlot(futureAt(9, 0)).ok).toBe(true);
  });

  test('accepts the last slot of the day (16:30, ends 17:00)', () => {
    expect(validateSlot(futureAt(16, 30)).ok).toBe(true);
  });

  test('rejects a 17:00 start — outside working hours', () => {
    const r = validateSlot(futureAt(17, 0));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/working hours/i);
  });

  test('rejects 09:15 — not on a 30-minute boundary', () => {
    const r = validateSlot(futureAt(9, 15));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/30-minute/);
  });

  test('rejects 08:30 — before opening', () => {
    expect(validateSlot(futureAt(8, 30)).ok).toBe(false);
  });

  test('rejects a past datetime', () => {
    expect(validateSlot(new Date('2020-01-06T10:00:00')).ok).toBe(false);
  });

  test('rejects a malformed date string', () => {
    const r = validateSlot('not-a-date');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/valid/);
  });
});
