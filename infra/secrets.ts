// Supabase transaction-mode pooler URL (port 6543), set per stage via
//   bunx sst secret set DivvyUpDatabaseUrl "<url>" --stage <stage>
// Never file-committed; never pasted into logs or PR descriptions.
export const databaseUrl = new sst.Secret("DivvyUpDatabaseUrl");
