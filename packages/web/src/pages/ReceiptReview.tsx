import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { useGetExpense } from "@/hooks/api/useGetExpense";
import { useGetGroup } from "@/hooks/api/useGetGroup";
import { useUpdateItemAssignment } from "@/hooks/api/useUpdateItemAssignment";
import { useFinalizeExpense } from "@/hooks/api/useFinalizeExpense";
import { Avatar, AvatarStack } from "@/components/dd/Avatar";
import { Money } from "@/components/dd/Money";
import { Sheet } from "@/components/dd/Sheet";
import { splitPence, memberColor, fmt } from "@/lib/people";
import {
  IconArrowLeft,
  IconSparkles,
  IconFlag,
  IconCheck,
  IconReceipt,
} from "@tabler/icons-react";

type AssignMode = "one" | "equal" | "everyone" | "custom";

type ItemAssignment =
  | { type: "one"; memberId: string }
  | { type: "equal"; memberIds: string[] }
  | { type: "everyone" }
  | { type: "custom"; shares: Array<{ memberId: string; fraction: number }> };

interface ReceiptItem {
  id: string;
  description: string;
  unitPrice: number;
  quantity: number;
  assignment: ItemAssignment | null;
}

interface Member {
  id: string;
  name: string;
  color: string;
}

function computeSplit(items: ReceiptItem[], memberIds: string[]) {
  const per: Record<string, number> = Object.fromEntries(
    memberIds.map((id) => [id, 0]),
  );
  let unassigned = 0;
  let itemsSubtotal = 0;

  for (const it of items) {
    const amt = it.unitPrice * it.quantity;
    itemsSubtotal += amt;
    const a = it.assignment;
    if (!a) {
      unassigned += amt;
      continue;
    }

    let targets: string[];
    let weights: number[];

    if (a.type === "one") {
      targets = [a.memberId];
      weights = [1];
    } else if (a.type === "equal") {
      targets = a.memberIds;
      weights = a.memberIds.map(() => 1);
    } else if (a.type === "everyone") {
      targets = memberIds;
      weights = memberIds.map(() => 1);
    } else {
      targets = a.shares.map((s) => s.memberId);
      weights = a.shares.map((s) => s.fraction);
    }

    if (!targets.length) {
      unassigned += amt;
      continue;
    }
    // Split in member-id order, because that's the order the server reads the
    // item's members back in — and `splitPence`'s largest-remainder tie-break
    // gives the odd penny to the earliest participant. Previewing in selection
    // order instead would show a 1p-different split from the balances that
    // appear after finalizing. Weights travel with their member.
    const ordered = targets
      .map((id, i) => [id, weights[i]] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const parts = splitPence(
      amt,
      ordered.map(([, w]) => w),
    );
    ordered.forEach(([id], i) => {
      per[id] = (per[id] ?? 0) + parts[i];
    });
  }

  return { perPerson: per, unassigned, itemsSubtotal, total: itemsSubtotal };
}

function AssignBadge({
  assignment,
  allMembers,
}: {
  assignment: ItemAssignment | null;
  allMembers: Member[];
}) {
  if (!assignment) {
    return (
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#3A1B02",
          background: "var(--amber)",
          padding: "4px 11px",
          borderRadius: 999,
        }}
      >
        Assign
      </span>
    );
  }
  if (assignment.type === "everyone") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: "var(--surface-3)",
          padding: "3px 9px 3px 4px",
          borderRadius: 999,
        }}
      >
        <AvatarStack members={allMembers} size={18} max={4} />
        <span
          style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-2)" }}
        >
          All
        </span>
      </span>
    );
  }
  const ids =
    assignment.type === "one"
      ? [assignment.memberId]
      : assignment.type === "equal"
        ? assignment.memberIds
        : assignment.shares.map((s) => s.memberId);
  const assigned = ids
    .map((id) => allMembers.find((m) => m.id === id))
    .filter(Boolean) as Member[];
  return assigned.length === 1 ? (
    <Avatar name={assigned[0].name} color={assigned[0].color} size={26} />
  ) : (
    <AvatarStack members={assigned} size={24} max={3} />
  );
}

function ItemEditor({
  item,
  allMembers,
  onClose,
  onSave,
}: {
  item: ReceiptItem;
  allMembers: Member[];
  onClose: () => void;
  onSave: (itemId: string, assignment: ItemAssignment) => void;
}) {
  const init = item.assignment;
  const [mode, setMode] = useState<AssignMode>(
    init?.type === "one"
      ? "one"
      : init?.type === "equal"
        ? "equal"
        : init?.type === "everyone"
          ? "everyone"
          : "everyone",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(
    init
      ? init.type === "one"
        ? [init.memberId]
        : init.type === "equal"
          ? init.memberIds
          : init.type === "everyone"
            ? allMembers.map((m) => m.id)
            : init.shares.map((s) => s.memberId)
      : [],
  );

  const modes: [AssignMode, string][] = [
    ["one", "One"],
    ["equal", "Split"],
    ["everyone", "Everyone"],
    ["custom", "Custom"],
  ];
  const amt = item.unitPrice * item.quantity;

  function buildAssignment(): ItemAssignment {
    if (mode === "everyone") return { type: "everyone" };
    if (mode === "one")
      return { type: "one", memberId: selectedIds[0] ?? allMembers[0]?.id };
    if (mode === "equal")
      return {
        type: "equal",
        memberIds: selectedIds.length ? selectedIds : [allMembers[0]?.id],
      };
    return {
      type: "custom",
      shares: selectedIds.map((id) => ({
        memberId: id,
        fraction: 1 / selectedIds.length,
      })),
    };
  }

  const preview = useMemo(() => {
    if (mode === "everyone") {
      const p = splitPence(
        amt,
        allMembers.map(() => 1),
      );
      return Object.fromEntries(allMembers.map((m, i) => [m.id, p[i]]));
    }
    if (mode === "one") {
      const id = selectedIds[0] ?? allMembers[0]?.id;
      return id ? { [id]: amt } : {};
    }
    if (!selectedIds.length) return {};
    const p = splitPence(
      amt,
      selectedIds.map(() => 1),
    );
    return Object.fromEntries(selectedIds.map((id, i) => [id, p[i]]));
  }, [mode, selectedIds, amt, allMembers]);

  function toggleId(id: string) {
    if (mode === "one") {
      setSelectedIds([id]);
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const modeHint: Record<AssignMode, string> = {
    one: "One person pays for this item.",
    equal: "Split equally between everyone you pick.",
    everyone: "Everyone in the group splits it evenly.",
    custom: "Pick who shares this item.",
  };

  return (
    <Sheet open onClose={onClose} pad={false}>
      <div style={{ padding: "2px 18px 0" }}>
        <div
          style={{
            background: "var(--surface)",
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 8,
          }}
        >
          <div className="dd-display" style={{ fontSize: 19 }}>
            {item.description}
          </div>
          <div
            style={{
              color: "var(--ink-3)",
              fontSize: 13.5,
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {fmt(item.unitPrice)}
            {item.quantity > 1 ? ` × ${item.quantity} = ${fmt(amt)}` : ""}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            background: "var(--surface)",
            padding: 4,
            borderRadius: 14,
            marginBottom: 8,
          }}
        >
          {modes.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              style={{
                flex: 1,
                height: 38,
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: 700,
                background: mode === k ? "var(--brand)" : "transparent",
                color: mode === k ? "var(--on-brand)" : "var(--ink-2)",
                border: "none",
                cursor: "pointer",
                transition: "all .15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--ink-3)",
            fontWeight: 600,
            padding: "0 2px 10px",
          }}
        >
          {modeHint[mode]}
        </div>
      </div>
      <div
        style={{
          padding: "0 18px",
          display: "flex",
          flexDirection: "column",
          gap: 7,
        }}
      >
        {allMembers.map((m) => {
          const selected =
            mode === "everyone" ? true : selectedIds.includes(m.id);
          const pay = preview[m.id];
          return (
            <div
              key={m.id}
              onClick={() => mode !== "everyone" && toggleId(m.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 13px",
                borderRadius: 14,
                background: selected ? "var(--brand-wash)" : "var(--surface)",
                border: `1px solid ${selected ? "var(--brand-dim)" : "var(--hairline)"}`,
                cursor: mode === "everyone" ? "default" : "pointer",
                transition: "all .15s",
              }}
            >
              <Avatar name={m.name} color={m.color} size={36} dim={!selected} />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: selected ? "var(--ink)" : "var(--ink-3)",
                  }}
                >
                  {m.name}
                </div>
                {selected && pay != null && (
                  <Money pence={pay} size={12.5} color="var(--ink-3)" />
                )}
              </div>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: selected ? "none" : "2px solid var(--hairline-2)",
                  background: selected ? "var(--brand)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selected && <IconCheck size={15} color="var(--on-brand)" />}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "16px 18px 8px" }}>
        <button
          onClick={() => onSave(item.id, buildAssignment())}
          style={{
            height: 56,
            width: "100%",
            borderRadius: 18,
            background: "var(--brand)",
            color: "var(--on-brand)",
            border: "none",
            fontWeight: 700,
            fontSize: 17,
            cursor: "pointer",
            boxShadow: "var(--shadow-brand)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <IconCheck size={20} /> Save assignment
        </button>
      </div>
    </Sheet>
  );
}

function SavedScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        zIndex: 300,
        animation: "dd-fade .3s ease",
      }}
    >
      <div
        style={{
          width: 108,
          height: 108,
          borderRadius: "50%",
          background: "var(--pos)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "dd-pop .5s cubic-bezier(.2,.9,.3,1) both",
        }}
      >
        <svg width="56" height="56" viewBox="0 0 24 24">
          <path
            d="M5 12.5l4.5 4.5L19 7"
            fill="none"
            stroke="#053024"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="60"
            style={{ animation: "dd-check-draw .5s .2s ease both" }}
          />
        </svg>
      </div>
      <div>
        <h1
          className="dd-display"
          style={{ fontSize: 28, textAlign: "center", margin: "0 0 8px" }}
        >
          Split saved!
        </h1>
        <p
          style={{
            color: "var(--ink-2)",
            fontSize: 15.5,
            fontWeight: 600,
            textAlign: "center",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Everyone can see what they owe.
        </p>
      </div>
      <button
        onClick={onContinue}
        style={{
          color: "var(--brand-bright)",
          background: "none",
          border: "none",
          fontWeight: 700,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        Back to group →
      </button>
    </div>
  );
}

export function ReceiptReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: rawExpense, isLoading } = useGetExpense(id!);
  const expense = rawExpense as
    | {
        id: string;
        groupId: string;
        payerId: string;
        description: string;
        date: string;
        status: string;
        items: ReceiptItem[];
      }
    | null
    | undefined;

  const { data: rawGroup } = useGetGroup(expense?.groupId);
  const group = rawGroup as
    | { members: Array<{ id: string; name: string }> }
    | null
    | undefined;

  const [localItems, setLocalItems] = useState<ReceiptItem[] | null>(null);
  const items = useMemo<ReceiptItem[]>(
    () => localItems ?? expense?.items ?? [],
    [localItems, expense?.items],
  );

  const updateAssignment = useUpdateItemAssignment(id!);
  const finalize = useFinalizeExpense(id!);
  const [editing, setEditing] = useState<ReceiptItem | null>(null);
  const [saved, setSaved] = useState(false);

  const members: Member[] = useMemo(
    () =>
      (group?.members ?? []).map((m, i) => ({
        id: m.id,
        name: m.name,
        color: memberColor(i),
      })),
    [group?.members],
  );
  // Sorted by id to match the order the server freezes an `everyone` split in
  // (it resolves members by id, and reads them back the same way). The order
  // decides who takes the largest-remainder odd penny, so an unsorted list would
  // let this preview disagree by 1p with the balances shown after finalizing.
  const memberIds = useMemo(() => members.map((m) => m.id).sort(), [members]);
  const split = useMemo(
    () => computeSplit(items, memberIds),
    [items, memberIds],
  );
  const flagged = items.filter((it) => !it.assignment);

  async function saveAssignment(itemId: string, assignment: ItemAssignment) {
    const snapshot = localItems ?? expense?.items ?? [];
    setLocalItems(
      snapshot.map((it) => (it.id === itemId ? { ...it, assignment } : it)),
    );
    setEditing(null);
    try {
      await updateAssignment.mutateAsync({ itemId, assignment });
    } catch {
      setLocalItems(snapshot);
    }
  }

  async function handleFinalize() {
    await finalize.mutateAsync();
    setSaved(true);
  }

  if (isLoading) {
    return (
      <div
        style={{
          height: "100dvh",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "var(--ink-3)" }}>Loading receipt…</p>
      </div>
    );
  }

  if (!expense) {
    return (
      <div
        style={{
          height: "100dvh",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <p style={{ color: "var(--ink-3)" }}>Receipt not found</p>
        <button
          onClick={() => navigate(-1)}
          style={{
            color: "var(--brand-bright)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          ← Back
        </button>
      </div>
    );
  }

  if (saved)
    return (
      <SavedScreen
        onContinue={() =>
          navigate(
            expense.groupId ? `/groups/${expense.groupId}/balances` : "/",
            { state: { payerId: expense.payerId } },
          )
        }
      />
    );

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        position: "relative",
      }}
    >
      <div style={{ height: 58 }} />

      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 14px 8px",
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--surface)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ink-2)",
          }}
        >
          <IconArrowLeft size={20} />
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 16.5, fontWeight: 800 }}>Review & assign</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>
            {expense.description} · you paid
          </div>
        </div>
        <button
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: "var(--surface)",
            border: "1px solid var(--hairline-2)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconReceipt size={18} color="var(--ink-2)" />
        </button>
      </div>

      {/* AI banner */}
      <div style={{ padding: "0 16px 10px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background:
              "linear-gradient(100deg, var(--brand-wash), var(--amber-wash))",
            border: "1px solid var(--hairline)",
            borderRadius: 14,
            padding: "11px 14px",
          }}
        >
          <IconSparkles size={20} color="var(--amber)" />
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>
            Review items and assign them to group members
          </div>
        </div>
      </div>

      {/* attention banner */}
      {flagged.length > 0 && (
        <div style={{ padding: "0 16px 10px" }}>
          <button
            onClick={() => setEditing(flagged[0])}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 11,
              background: "var(--amber-wash)",
              border: "1px solid rgba(255,169,104,0.4)",
              borderRadius: 14,
              padding: "11px 14px",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "var(--amber)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <IconFlag size={16} color="#3A1B02" />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: "var(--amber-bright)",
                }}
              >
                {flagged.length} item{flagged.length > 1 ? "s" : ""} need
                assigning
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-3)",
                  fontWeight: 600,
                }}
              >
                Tap to assign
              </div>
            </div>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--amber-bright)"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* items */}
      <div
        className="dd-scroll"
        style={{ flex: 1, overflow: "auto", padding: "0 16px 14px" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it) => {
            const unassigned = !it.assignment;
            return (
              <button
                key={it.id}
                onClick={() => setEditing(it)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  textAlign: "left",
                  background: "var(--surface)",
                  borderRadius: "var(--r-md)",
                  padding: "13px 14px",
                  border: "1px solid var(--hairline)",
                  borderLeft: unassigned
                    ? "3px solid var(--amber)"
                    : "1px solid var(--hairline)",
                  cursor: "pointer",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700 }}>
                    {it.quantity > 1 && (
                      <span
                        className="dd-num"
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "var(--brand-bright)",
                          background: "var(--brand-wash)",
                          padding: "1px 6px",
                          borderRadius: 6,
                          marginRight: 6,
                        }}
                      >
                        {it.quantity}×
                      </span>
                    )}
                    {it.description}
                  </div>
                  {unassigned ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginTop: 4,
                        color: "var(--amber-bright)",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      <IconFlag size={13} color="var(--amber)" /> Tap to assign
                    </div>
                  ) : (
                    <div
                      className="dd-num"
                      style={{
                        fontSize: 13,
                        color: "var(--ink-3)",
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      {fmt(it.unitPrice)}
                      {it.quantity > 1 ? " each" : ""}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    textAlign: "right",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 5,
                  }}
                >
                  <Money pence={it.unitPrice * it.quantity} size={15.5} />
                  <AssignBadge
                    assignment={it.assignment}
                    allMembers={members}
                  />
                </div>
              </button>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 14,
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--r-md)",
            padding: "4px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "11px 0",
            }}
          >
            <span
              style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink-2)" }}
            >
              Items subtotal
            </span>
            <Money pence={split.itemsSubtotal} size={14.5} />
          </div>
        </div>
        <div style={{ height: 8 }} />
      </div>

      {/* live split bar */}
      <div
        style={{
          borderTop: "1px solid var(--hairline)",
          background: "var(--bg-2)",
          boxShadow: "0 -8px 24px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className="dd-scroll"
          style={{
            display: "flex",
            gap: 9,
            overflowX: "auto",
            padding: "12px 16px 4px",
          }}
        >
          {members.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                minWidth: 56,
                flexShrink: 0,
              }}
            >
              <Avatar name={m.name} color={m.color} size={36} />
              <span
                style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}
              >
                {m.name}
              </span>
              <Money pence={split.perPerson[m.id] ?? 0} size={13.5} />
            </div>
          ))}
          {split.unassigned > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                minWidth: 56,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: "1.6px dashed var(--amber)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconFlag size={16} color="var(--amber)" />
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--amber-bright)",
                }}
              >
                none
              </span>
              <Money
                pence={split.unassigned}
                size={13.5}
                color="var(--amber-bright)"
              />
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 16px 26px",
          }}
        >
          <div>
            <div
              style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700 }}
            >
              TOTAL
            </div>
            <Money pence={split.total} size={23} />
          </div>
          <div style={{ flex: 1 }}>
            <button
              onClick={handleFinalize}
              disabled={
                split.unassigned > 0 ||
                finalize.isPending ||
                expense.status === "finalized"
              }
              style={{
                height: 56,
                width: "100%",
                borderRadius: 18,
                background:
                  split.unassigned > 0 || expense.status === "finalized"
                    ? "var(--surface-2)"
                    : "var(--brand)",
                color:
                  split.unassigned > 0 || expense.status === "finalized"
                    ? "var(--ink-3)"
                    : "var(--on-brand)",
                border: "none",
                fontWeight: 700,
                fontSize: 17,
                cursor:
                  split.unassigned > 0 || expense.status === "finalized"
                    ? "default"
                    : "pointer",
                boxShadow:
                  split.unassigned > 0 ? "none" : "var(--shadow-brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all .15s",
              }}
            >
              {expense.status === "finalized" ? (
                <>
                  <IconCheck size={20} /> Finalized
                </>
              ) : split.unassigned > 0 ? (
                "Assign all items"
              ) : finalize.isPending ? (
                "Saving…"
              ) : (
                <>
                  <IconCheck size={20} /> Confirm & save
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <ItemEditor
          item={editing}
          allMembers={members}
          onClose={() => setEditing(null)}
          onSave={saveAssignment}
        />
      )}
    </div>
  );
}
