import { test, expect } from '@playwright/test';
import { scoreThemes } from '../src/data/focus';

test('matching uses evidence, caps keywords and respects disabled themes', () => {
  const input = { experience: 'BUSINESS business marketing business', best: 'business marketing', confirmed: ['business'], verified: ['business', 'business'], disabled: [] as string[] };
  const scores = scoreThemes(input);
  expect(scores.find(s => s.theme === 'business')).toMatchObject({ score: 13, active: true });
  expect(scoreThemes({ ...input, disabled: ['business'] }).find(s => s.theme === 'business')).toMatchObject({ score: 13, active: false });
  expect(scoreThemes({ ...input, experience: '', best: '', confirmed: [], verified: [] }).every(s => s.score === 0 && !s.active)).toBe(true);
  expect(scoreThemes(input)).toEqual(scores);
});
