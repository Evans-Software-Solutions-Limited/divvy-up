import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useGetGroups } from "@/hooks/api/useGetGroups";
import { api } from "@/lib/eden";
import { TabBar } from "./Home";
import {
  IconReceipt,
  IconArrowsExchange,
  IconUserPlus,
  IconActivity,
} from "@tabler/icons-react";

type ActivityKind = "expense_added" | "settled_up" | "member_added";

type ActivityRow = {
  id: string;
  groupId: string;
  actorMemberId: string;
  kind: ActivityKind;
  text: string;
  amount: number | null;
  expenseId: string | null;
  settlementId: string | null;
  createdAt: string;
};

type ActivityRowWithGroup = ActivityRow & { groupName: string };

function kindIcon(kind: ActivityKind) {
  switch (kind) {
    case "expense_added":
      return <IconReceipt size={20} color="var(--brand-bright)" />;
    case "settled_up":
      return <IconArrowsExchange size={20} color="var(--brand-bright)" />;
    case "member_added":
      return <IconUserPlus size={20} color="var(--brand-bright)" />;
    default:
      return <IconActivity size={20} color="var(--brand-bright)" />;
  }
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── Activity page ────────────────────────────────────────────────────────────

export function Activity() {
  const { data: groups, isLoading: groupsLoading } = useGetGroups();

  // The activity feed is per-group on the server, but the nav tab is a single
  // global feed. This is a small, personal-use app (a handful of groups at
  // most), so fanning out one request per group on every visit and merging
  // client-side is fine — it isn't built to scale to many groups.
  const activityQueries = useQueries({
    queries: (groups ?? []).map((g) => ({
      queryKey: ["groups", g.id, "activity"],
      queryFn: () =>
        api.core
          .groups({ id: g.id })
          .activity.get()
          .then((res) => {
            const data = res.data as
              | { activity: ActivityRow[] }
              | null
              | undefined;
            return data?.activity ?? [];
          }),
      enabled: !!g.id,
    })),
  });

  const activityLoading = activityQueries.some((q) => q.isLoading);
  const isLoading = groupsLoading || activityLoading;

  const rows = useMemo(() => {
    const groupNameById = new Map((groups ?? []).map((g) => [g.id, g.name]));
    const merged: ActivityRowWithGroup[] = [];
    (groups ?? []).forEach((g, i) => {
      const activity = activityQueries[i]?.data ?? [];
      for (const a of activity) {
        merged.push({ ...a, groupName: groupNameById.get(g.id) ?? "" });
      }
    });
    return merged.sort((a, b) => {
      const diff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (diff !== 0) return diff;
      return b.id.localeCompare(a.id);
    });
  }, [groups, activityQueries]);

  return (
    <div
      className="dd-scroll"
      style={{
        height: "100dvh",
        overflow: "auto",
        background: "var(--bg)",
        position: "relative",
      }}
    >
      <div style={{ height: 56 }} />

      {/* header */}
      <div style={{ padding: "4px 20px 8px" }}>
        <div
          style={{
            color: "var(--ink-3)",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 2,
          }}
        >
          Divvy Up
        </div>
        <div className="dd-display" style={{ fontSize: 27, lineHeight: 1.05 }}>
          Activity
        </div>
      </div>

      <div
        style={{
          padding: "14px 20px 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {isLoading && (
          <p style={{ color: "var(--ink-3)", fontSize: 14 }}>Loading…</p>
        )}

        {!isLoading && rows.length === 0 && (
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--hairline)",
              padding: "40px 20px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                marginBottom: 12,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <IconActivity size={40} color="var(--ink-4)" />
            </div>
            <p style={{ fontWeight: 600, margin: "0 0 4px" }}>
              No activity yet
            </p>
            <p style={{ color: "var(--ink-3)", fontSize: 14, margin: 0 }}>
              Expenses, settle-ups, and new members will show up here.
            </p>
          </div>
        )}

        {!isLoading &&
          rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                background: "var(--surface)",
                borderRadius: "var(--r-md)",
                padding: "13px 15px",
                border: "1px solid var(--hairline)",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  background: "var(--surface-2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {kindIcon(row.kind)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{row.text}</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  {row.groupName && (
                    <span
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--ink-3)",
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "3px 9px",
                        borderRadius: 999,
                      }}
                    >
                      {row.groupName}
                    </span>
                  )}
                  <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
                    {formatRelativeTime(row.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          ))}
      </div>

      <div style={{ height: 96 }} />
      <TabBar active="activity" />
    </div>
  );
}

export default Activity;
