import { ValueTransformer } from 'typeorm';

/**
 * Postgres `numeric` columns come back from `pg` as strings (to avoid float precision
 * loss). We want a plain JS number in the entity/API response, so the `amount` column
 * uses this transformer.
 */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? value : parseFloat(value),
};
