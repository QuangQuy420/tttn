import { ValueTransformer } from 'typeorm';

/**
 * Postgres `numeric` columns come back from `pg` as strings (to avoid float precision
 * loss). We want plain JS numbers in entities/DTOs for API responses and filtering, so
 * every numeric money/score column uses this transformer.
 */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? value : parseFloat(value),
};
