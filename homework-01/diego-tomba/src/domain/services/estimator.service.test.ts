import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimate, suggestBudgetUsd } from './estimator.service.ts';

describe('Estimator Service', () => {
  describe('buildEstimate', () => {
    it('should correctly compute mean and p90 for cost, input and output', () => {
      const samples = [
        { cost: 0.1, input: 100, output: 50 },
        { cost: 0.2, input: 200, output: 100 },
        { cost: 0.3, input: 300, output: 150 },
        { cost: 0.4, input: 400, output: 200 },
        { cost: 1.0, input: 1000, output: 500 }, // Outlier
      ];

      const estimate = buildEstimate('test-task', samples);

      assert.strictEqual(estimate.taskType, 'test-task');
      assert.strictEqual(estimate.sampleSize, 5);

      // Cost mean: (0.1 + 0.2 + 0.3 + 0.4 + 1.0) / 5 = 2.0 / 5 = 0.4
      assert.strictEqual(estimate.cost.mean, 0.4);

      // The sorted values are [0.1, 0.2, 0.3, 0.4, 1.0].
      // p90 rank: 0.9 * (5 - 1) = 3.6
      // Interpolation between index 3 (0.4) and 4 (1.0):
      // 0.4 + (1.0 - 0.4) * 0.6 = 0.4 + 0.6 * 0.6 = 0.4 + 0.36 = 0.76
      assert.strictEqual(estimate.cost.p90, 0.76);

      // Input mean: 2000 / 5 = 400
      assert.strictEqual(estimate.input.mean, 400);

      // Input p90 rank (3.6): 400 + (1000 - 400) * 0.6 = 400 + 360 = 760
      assert.strictEqual(estimate.input.p90, 760);
    });

    it('should handle an empty array of samples', () => {
      const estimate = buildEstimate('test-empty', []);
      assert.strictEqual(estimate.sampleSize, 0);
      assert.strictEqual(estimate.cost.mean, 0);
      assert.strictEqual(estimate.cost.p90, 0);
    });

    it('should handle a single sample', () => {
      const estimate = buildEstimate('test-single', [{ cost: 0.5, input: 500, output: 250 }]);
      assert.strictEqual(estimate.sampleSize, 1);
      assert.strictEqual(estimate.cost.mean, 0.5);
      assert.strictEqual(estimate.cost.p90, 0.5);
    });
  });

  describe('suggestBudgetUsd', () => {
    it('should return 0 when there are no samples', () => {
      const est = buildEstimate('task', []);
      assert.strictEqual(suggestBudgetUsd(est), 0);
    });

    it('should apply a 2.0 margin for fewer than 5 samples', () => {
      // 4 samples
      const est = buildEstimate('task', [
        { cost: 0.1, input: 10, output: 10 },
        { cost: 0.2, input: 20, output: 20 },
        { cost: 0.3, input: 30, output: 30 },
        { cost: 0.4, input: 40, output: 40 },
      ]);
      // p90 rank: 0.9 * 3 = 2.7 -> 0.3 + (0.4 - 0.3) * 0.7 = 0.37
      // Margin (sampleSize < 5) = 2.0 -> 0.37 * 2.0 = 0.74
      assert.strictEqual(suggestBudgetUsd(est), 0.74);
    });

    it('should apply a 1.5 margin for between 5 and 19 samples', () => {
      // 5 samples
      const est = buildEstimate('task', [
        { cost: 0.1, input: 10, output: 10 },
        { cost: 0.2, input: 20, output: 20 },
        { cost: 0.3, input: 30, output: 30 },
        { cost: 0.4, input: 40, output: 40 },
        { cost: 0.5, input: 50, output: 50 },
      ]);
      // p90 is 0.4 + (0.5 - 0.4) * 0.6 = 0.46
      // Margin (sampleSize < 20) = 1.5 -> 0.46 * 1.5 = 0.69
      assert.strictEqual(suggestBudgetUsd(est), 0.69);
    });

    it('should apply a 1.25 margin for 20 or more samples', () => {
      const samples = Array.from({ length: 20 }, (_, i) => ({
        cost: (i + 1) * 0.1, // 0.1, 0.2 ... 2.0
        input: 10,
        output: 10
      }));
      const est = buildEstimate('task', samples);
      // Costs range from 0.1 to 2.0
      // p90 rank: 0.9 * 19 = 17.1 -> index 17 (1.8) and 18 (1.9)
      // p90 = 1.8 + (1.9 - 1.8) * 0.1 = 1.81
      // Margin (sampleSize >= 20) = 1.25 -> 1.81 * 1.25 = 2.2625
      assert.strictEqual(suggestBudgetUsd(est), 2.2625);
    });
  });
});
