// Part F — refund calculator tests (pure function: no MySQL, no Redis).
// Documented policy under test:
//   notice > 48h -> 100% | 24h <= notice <= 48h -> 50% | notice < 24h -> 0%
// Both boundaries (exactly 24h, exactly 48h) therefore refund 50%.
const { calculateRefund } = require('../src/utils/refund');

const NOW = new Date('2026-07-01T12:00:00Z');
const hoursFromNow = (h) => new Date(NOW.getTime() + h * 60 * 60 * 1000);

describe('calculateRefund', () => {
  test('more than 48 hours notice -> 100% refund', () => {
    const r = calculateRefund(150, hoursFromNow(72), NOW);
    expect(r.refundPercent).toBe(100);
    expect(r.refundAmount).toBe(150);
  });

  test('exactly 48 hours notice (boundary) -> 50% refund', () => {
    const r = calculateRefund(150, hoursFromNow(48), NOW);
    expect(r.refundPercent).toBe(50);
    expect(r.refundAmount).toBe(75);
  });

  test('between 24 and 48 hours notice -> 50% refund', () => {
    const r = calculateRefund(100, hoursFromNow(30), NOW);
    expect(r.refundPercent).toBe(50);
    expect(r.refundAmount).toBe(50);
  });

  test('exactly 24 hours notice (boundary) -> 50% refund', () => {
    const r = calculateRefund(200, hoursFromNow(24), NOW);
    expect(r.refundPercent).toBe(50);
    expect(r.refundAmount).toBe(100);
  });

  test('just under 24 hours notice -> 0% refund', () => {
    const r = calculateRefund(150, hoursFromNow(23.99), NOW);
    expect(r.refundPercent).toBe(0);
    expect(r.refundAmount).toBe(0);
  });

  test('appointment in the past -> 0% refund', () => {
    const r = calculateRefund(150, hoursFromNow(-2), NOW);
    expect(r.refundPercent).toBe(0);
    expect(r.refundAmount).toBe(0);
  });

  test('rejects an invalid datetime', () => {
    expect(() => calculateRefund(150, 'not-a-date', NOW)).toThrow(TypeError);
  });
});
