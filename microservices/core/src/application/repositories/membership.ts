// The membership predicate now lives in `@divvy-up/api-utils/auth` so both
// microservices share one authorization check (avoids drift). Re-exported here
// under the path the core repositories already import, so their call sites and
// tests are unchanged.
export { isActiveMember } from "@divvy-up/api-utils/auth";
