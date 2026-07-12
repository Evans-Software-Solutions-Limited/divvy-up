// Supabase transaction-mode pooler URL (port 6543), set per stage via
//   bunx sst secret set DivvyUpDatabaseUrl "<url>" --stage <stage>
// Never file-committed; never pasted into logs or PR descriptions.
export const databaseUrl = new sst.Secret("DivvyUpDatabaseUrl");

// Supabase project URL (JWKS lives at `${supabaseUrl}/auth/v1/.well-known/jwks.json`),
// set per stage via
//   bunx sst secret set DivvyUpSupabaseUrl "<url>" --stage <stage>
export const supabaseUrl = new sst.Secret("DivvyUpSupabaseUrl");
