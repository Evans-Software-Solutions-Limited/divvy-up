import { useGetGroups } from "@/hooks/api/useGetGroups";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconPlus, IconReceipt } from "@tabler/icons-react";

export function Home() {
  const { isLoading, data: groups } = useGetGroups();

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Groups</h1>
        <Button size="sm">
          <IconPlus data-icon="inline-start" />
          New group
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && (!groups || groups.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <IconReceipt className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="font-medium">No groups yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Create a group to start splitting expenses.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading &&
        groups &&
        groups.map((group) => (
          <Card
            key={group.id}
            className="mb-3 cursor-pointer hover:bg-muted/50"
          >
            <CardHeader>
              <CardTitle className="text-base">{group.name}</CardTitle>
            </CardHeader>
          </Card>
        ))}
    </div>
  );
}

export default Home;
