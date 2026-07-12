// Any id arriving from a URL param may be arbitrary user input (e.g. a
// fixture id, a typo, garbage). Postgres would throw a cast error on a
// non-UUID string passed to a `uuid` column comparison; guard here so the
// API keeps 404-ing on garbage ids instead of 500-ing.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
