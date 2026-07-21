import { describe, expect, test } from 'bun:test';
import { computeScore } from './score';

const example = {
  scoring: {
    elementScores: {
      metrics: 3,
      economicBuyer: 3,
      decisionCriteria: 3,
      decisionProcess: 2,
      paperProcess: 0,
      implicateThePain: 4,
      champion: 4,
      competition: 2,
    },
  },
};

describe('computeScore', () => {
  test('sums the 8 element scores from the example to 21 / 65.6 / Yellow', () => {
    const r = computeScore(example);
    expect(r.sum).toBe(21);
    expect(r.overallScore).toBe(65.6);
    expect(r.overallRating).toBe('Yellow');
  });
  test('Red boundary at 13, Green boundary at 26', () => {
    const at13 = computeScore({ scoring: { elementScores: { metrics: 13 } } });
    expect(at13.overallRating).toBe('Red');
    const at14 = computeScore({ scoring: { elementScores: { metrics: 14 } } });
    expect(at14.overallRating).toBe('Yellow');
    const at26 = computeScore({ scoring: { elementScores: { metrics: 26 } } });
    expect(at26.overallRating).toBe('Green');
  });
  test('missing scores count as 0', () => {
    const r = computeScore({});
    expect(r.sum).toBe(0);
    expect(r.overallRating).toBe('Red');
  });
});
