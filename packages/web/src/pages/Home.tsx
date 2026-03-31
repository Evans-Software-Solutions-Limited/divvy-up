import { useGetGroups } from "@/hooks/api/useGetGroups";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { IconPlus, IconReceipt, IconChevronRight } from "@tabler/icons-react";

export function Home() {
  const { isLoading, data: groups } = useGetGroups();

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-4">
      {/* Page header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My Groups</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage your shared expenses
          </p>
        </div>
        <Button size="sm">
          <IconPlus data-icon="inline-start" />
          New group
        </Button>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[72px] animate-pulse rounded-2xl bg-muted/60"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!groups || groups.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted">
              <IconReceipt className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No groups yet</p>
            <p className="mt-1 max-w-[220px] text-sm text-muted-foreground">
              Create a group to start splitting expenses with friends.
            </p>
            <Button size="sm" className="mt-5">
              <IconPlus data-icon="inline-start" />
              Create your first group
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Group list */}
      {!isLoading && groups && (
        <div className="space-y-2">
          {groups.map((group) => (
            <Card
              key={group.id}
              className="cursor-pointer transition-colors hover:bg-muted/40 active:bg-muted/60"
              size="sm"
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-[0.95rem]">
                      {group.name}
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      Tap to view expenses
                    </CardDescription>
                  </div>
                  <IconChevronRight className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default Home;
