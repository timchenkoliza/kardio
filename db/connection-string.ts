/**
 * The connection string the Neon integration hands to Vercel ends with
 * `sslmode=require`. `pg` 8 treats `require`, `prefer` and `verify-ca` as
 * `verify-full` and warns about it on every cold start; `pg` 9 will stop
 * verifying the server certificate under those modes. The driver therefore
 * receives the mode it already applies, written out: `verify-full`.
 *
 * Only those three values are rewritten. `disable`, `verify-full`,
 * `no-verify`, an absent `sslmode` and every other parameter stay as they
 * are, and the string is edited textually so credentials are never re-encoded.
 */

const ALIASED_SSL_MODES = /([?&]sslmode=)(?:require|prefer|verify-ca)(?=&|$)/g;

export function normalizeDatabaseUrl(url: string): string {
  const query = url.indexOf("?");
  if (query === -1) return url;
  return url.slice(0, query) + url.slice(query).replace(ALIASED_SSL_MODES, "$1verify-full");
}
