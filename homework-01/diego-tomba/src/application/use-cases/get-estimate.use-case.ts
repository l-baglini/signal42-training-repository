/**
 * @file get-estimate.use-case.ts
 * @description Use case for computing the cost estimate.
 *              Fetches the historical usage samples for a given task type and
 *              uses the EstimatorService domain service to build the estimate
 *              and suggest an appropriate budget.
 */

import type { UsageRepository } from '../../domain/repositories/usage-repository.ts';
import type { Estimate } from '../../domain/entities/estimate.ts';
import { buildEstimate, suggestBudgetUsd } from '../../domain/services/estimator.service.ts';

/**
 * Use case: Get a cost estimate for a task type.
 *
 * Responsibility: orchestrate the retrieval of the historical samples and the
 * construction of the estimate via the domain service, returning both the
 * detailed estimate and the suggested budget in USD.
 */
export class GetEstimateUseCase {
  constructor(private readonly usageRepo: UsageRepository) {}

  /**
   * Computes the estimate for the specified task type.
   *
   * @param taskType - Task type to compute the estimate for (e.g. 'code-review', 'storytelling')
   * @returns An object with the detailed estimate and the suggested budget in USD
   */
  async execute(
    taskType: string,
  ): Promise<{ estimate: Estimate; suggestedBudgetUsd: number }> {
    // Fetch the historical usage samples for this task type
    const samples = await this.usageRepo.samplesFor(taskType);

    // Build the statistical estimate from the samples
    const estimate = buildEstimate(taskType, samples);

    return {
      estimate,
      suggestedBudgetUsd: suggestBudgetUsd(estimate),
    };
  }
}
