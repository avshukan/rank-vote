import { ordinal, pointsLabel } from './format';

describe('pointsLabel', () => {
  it('uses the singular only for exactly one point', () => {
    expect(pointsLabel(0)).toBe('0 points');
    expect(pointsLabel(1)).toBe('1 point');
    expect(pointsLabel(12)).toBe('12 points');
  });
});

describe('ordinal', () => {
  it('labels every place a poll can have', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '5th',
      '6th',
      '7th',
      '8th',
      '9th',
      '10th',
    ]);
  });

  it('follows English rules past ten', () => {
    expect([11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
    ]);
  });
});
