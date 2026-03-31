// Balances page — shows net amounts owed within a group.
// Full implementation pending: group selection and balance computation from API.

import { Card, CardContent } from "@/components/ui/card";
import { IconArrowsExchange } from "@tabler/icons-react";

export function Balances() {
  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-4">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Balances</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          See who owes what across your groups
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center py-14 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted">
            <IconArrowsExchange className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">Select a group</p>
          <p className="mt-1 max-w-[220px] text-sm text-muted-foreground">
            Choose a group to see who owes what.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default Balances;
