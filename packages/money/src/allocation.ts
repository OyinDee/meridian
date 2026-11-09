import { InvalidWeightsError } from './errors.js';
import { powerOfTen } from './rounding.js';

/**
 * Weights are quantised to 6 decimal places so that callers can pass either
 * integers (`bigint`) or fractions (`number`) without losing proportionality:
 * `0.333333` and `333333n` mean different things, but `3` and `3n` mean the same.
 */
export const WEIGHT_SCALE = 6;
const WEIGHT_FACTOR = powerOfTen(WEIGHT_SCALE);

/** Convert caller-supplied weights into positive bigints on a common scale. */
export function normalizeWeights(weights: readonly (number | bigint)[]): bigint[] {
  if (weights.length === 0) {
    throw new InvalidWeightsError('At least one weight is required');
  }

  const normalized: bigint[] = [];
  for (const weight of weights) {
    if (typeof weight === 'bigint') {
      if (weight < 0n) throw new InvalidWeightsError(`Weights must not be negative: ${weight}`);
      normalized.push(weight * WEIGHT_FACTOR);
      continue;
    }
    if (!Number.isFinite(weight)) {
      throw new InvalidWeightsError(`Weight must be a finite number: ${weight}`);
    }
    if (weight < 0) throw new InvalidWeightsError(`Weights must not be negative: ${weight}`);
    normalized.push(BigInt(Math.round(weight * Number(WEIGHT_FACTOR))));
  }

  const total = normalized.reduce((sum, weight) => sum + weight, 0n);
  if (total === 0n) throw new InvalidWeightsError('Total weight must be greater than zero');
  return normalized;
}

/**
 * Split `total` (in minor units) across `weights` so that the parts sum exactly to
 * `total`: no minor unit is created or destroyed.
 *
 * Uses the largest-remainder (Hamilton) method: every part gets its floored share,
 * then the leftover units go to the parts with the largest discarded fraction. Ties
 * are broken by index so the result is deterministic.
 *
 * `allocateMinor(100n, [1, 1, 1])` -> `[34n, 33n, 33n]`, never `[33n, 33n, 33n]`.
 */
export function allocateMinor(total: bigint, weights: readonly (number | bigint)[]): bigint[] {
  const normalized = normalizeWeights(weights);
  const totalWeight = normalized.reduce((sum, weight) => sum + weight, 0n);

  // Work on the magnitude so the remainder logic is direction-agnostic; a negative
  // total (a reversing entry) is allocated the same way and negated at the end.
  const negative = total < 0n;
  const magnitude = negative ? -total : total;

  const shares: bigint[] = [];
  const remainders: bigint[] = [];
  let distributed = 0n;

  for (let index = 0; index < normalized.length; index += 1) {
    const weight = normalized[index] as bigint;
    const product = magnitude * weight;
    const share = product / totalWeight;
    shares.push(share);
    remainders.push(product % totalWeight);
    distributed += share;
  }

  let leftover = magnitude - distributed;
  if (leftover > 0n) {
    const order = normalized
      .map((_, index) => index)
      .sort((left, right) => {
        const difference = (remainders[right] as bigint) - (remainders[left] as bigint);
        if (difference === 0n) return left - right;
        return difference > 0n ? 1 : -1;
      });

    for (let cursor = 0; leftover > 0n; cursor += 1) {
      const index = order[cursor % order.length] as number;
      shares[index] = (shares[index] as bigint) + 1n;
      leftover -= 1n;
    }
  }

  return negative ? shares.map((share) => -share) : shares;
}
