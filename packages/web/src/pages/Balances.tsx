// Balances page — shows net amounts owed within a group.
// Full implementation pending: group selection and balance computation from API.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Balances() {
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Balances</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select a group</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Choose a group to see who owes what.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default Balances;
