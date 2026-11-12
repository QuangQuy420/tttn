/**
 * product-service validates query strings with `forbidNonWhitelisted`, so
 * only the query keys each upstream route accepts are forwarded.
 */
export function pickQuery(
  query: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (query[key] !== undefined) {
      picked[key] = query[key];
    }
  }
  return picked;
}

/** Every query key except `keys`. */
export function omitQuery(
  query: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (!keys.includes(key)) {
      rest[key] = value;
    }
  }
  return rest;
}
