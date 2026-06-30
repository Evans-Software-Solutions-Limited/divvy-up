import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useGetGroup } from "@/hooks/api/useGetGroup";
import { useAddMember } from "@/hooks/api/useAddMember";
import { useGetGroupExpenses } from "@/hooks/api/useGetGroupExpenses";
import { Avatar } from "@/components/dd/Avatar";
import { Sheet } from "@/components/dd/Sheet";
import { memberColor } from "@/lib/people";
import {
  IconArrowLeft,
  IconPlus,
  IconCamera,
  IconReceipt,
  IconUsers,
  IconCheck,
} from "@tabler/icons-react";

// ── AddMemberSheet ────────────────────────────────────────────────────────────

function AddMemberSheet({
  groupId,
  open,
  onClose,
}: {
  groupId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const addMember = useAddMember(groupId);

  async function handleAdd() {
    if (!name.trim()) return;
    await addMember.mutateAsync(name.trim());
    setName("");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add member">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Name (no account needed)"
          style={{
            width: "100%",
            background: "var(--surface)",
            border: "1px solid var(--hairline-2)",
            borderRadius: 14,
            padding: "14px 16px",
            color: "var(--ink)",
            fontSize: 17,
            fontWeight: 600,
            outline: "none",
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!name.trim() || addMember.isPending}
          style={{
            height: 56,
            borderRadius: 18,
            background: name.trim() ? "var(--brand)" : "var(--surface-2)",
            color: name.trim() ? "var(--on-brand)" : "var(--ink-3)",
            border: "none",
            fontWeight: 700,
            fontSize: 17,
            cursor: name.trim() ? "pointer" : "default",
            transition: "all .15s",
            boxShadow: name.trim() ? "var(--shadow-brand)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {addMember.isPending ? (
            "Adding…"
          ) : (
            <>
              <IconCheck size={20} /> Add member
            </>
          )}
        </button>
      </div>
    </Sheet>
  );
}

// ── GroupDetail ───────────────────────────────────────────────────────────────

export function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: group, isLoading } = useGetGroup(id!);
  const { data: expenses } = useGetGroupExpenses(id!);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

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
        <p style={{ color: "var(--ink-3)" }}>Loading…</p>
      </div>
    );
  }

  if (!group) {
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
        <p style={{ color: "var(--ink-3)" }}>Group not found</p>
        <button
          onClick={() => navigate("/")}
          style={{
            color: "var(--brand-bright)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          ← Home
        </button>
      </div>
    );
  }

  const members =
    (group as { members: Array<{ id: string; name: string }> }).members ?? [];
  const memberObjs = members.map((m, i) => ({ ...m, color: memberColor(i) }));
  const expenseList = (expenses ?? []) as Array<{
    id: string;
    description: string;
    date: string;
    status: string;
    items: unknown[];
  }>;

  return (
    <div
      className="dd-scroll"
      style={{ height: "100dvh", overflow: "auto", background: "var(--bg)" }}
    >
      <div style={{ height: 56 }} />

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
          <div className="dd-display" style={{ fontSize: 20 }}>
            {(group as { name: string }).name}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>
            {members.length} member{members.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button
          onClick={() => navigate(`/scan?groupId=${id}`)}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--brand)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconCamera size={20} color="var(--on-brand)" />
        </button>
      </div>

      {/* members section */}
      <div style={{ padding: "8px 20px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div className="dd-display" style={{ fontSize: 17 }}>
            Members
          </div>
          <button
            onClick={() => setAddMemberOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: "var(--brand-bright)",
              fontSize: 14,
              fontWeight: 700,
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <IconPlus size={15} /> Add
          </button>
        </div>

        {members.length === 0 ? (
          <button
            onClick={() => setAddMemberOpen(true)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              padding: "15px",
              borderRadius: "var(--r-md)",
              border: "1.5px dashed var(--hairline-2)",
              color: "var(--ink-2)",
              fontSize: 15,
              fontWeight: 700,
              background: "none",
              cursor: "pointer",
            }}
          >
            <IconUsers size={18} color="var(--brand-bright)" /> Add your first
            member
          </button>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {memberObjs.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--surface)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 999,
                  padding: "5px 12px 5px 5px",
                }}
              >
                <Avatar name={m.name} color={m.color} size={26} />
                <span style={{ fontSize: 14, fontWeight: 700 }}>{m.name}</span>
              </div>
            ))}
            <button
              onClick={() => setAddMemberOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "1px dashed var(--hairline-2)",
                borderRadius: 999,
                padding: "5px 12px",
                color: "var(--ink-3)",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <IconPlus size={14} color="var(--brand-bright)" /> Add
            </button>
          </div>
        )}
      </div>

      {/* expenses section */}
      <div style={{ padding: "22px 20px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div className="dd-display" style={{ fontSize: 17 }}>
            Expenses
          </div>
        </div>

        {expenseList.length === 0 ? (
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--hairline)",
              padding: "32px 20px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                marginBottom: 10,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <IconReceipt size={36} color="var(--ink-4)" />
            </div>
            <p style={{ fontWeight: 600, margin: "0 0 4px" }}>
              No expenses yet
            </p>
            <p
              style={{
                color: "var(--ink-3)",
                fontSize: 13.5,
                margin: "0 0 16px",
              }}
            >
              Scan a receipt to split the first expense.
            </p>
            <button
              onClick={() => navigate(`/scan?groupId=${id}`)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "var(--brand)",
                color: "var(--on-brand)",
                border: "none",
                borderRadius: 14,
                padding: "11px 20px",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
                boxShadow: "var(--shadow-brand)",
              }}
            >
              <IconCamera size={18} /> Scan receipt
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {expenseList.map((exp) => (
              <button
                key={exp.id}
                onClick={() => navigate(`/receipts/${exp.id}/review`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "var(--surface)",
                  borderRadius: "var(--r-md)",
                  padding: "13px 15px",
                  border: "1px solid var(--hairline)",
                  textAlign: "left",
                  width: "100%",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background:
                      exp.status === "finalized"
                        ? "var(--pos-wash)"
                        : "var(--brand-wash)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <IconReceipt
                    size={20}
                    color={
                      exp.status === "finalized"
                        ? "var(--pos)"
                        : "var(--brand-bright)"
                    }
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700 }}>
                    {exp.description}
                  </div>
                  <div
                    style={{
                      color: "var(--ink-3)",
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginTop: 2,
                    }}
                  >
                    {exp.date} · {(exp.items as unknown[]).length} item
                    {(exp.items as unknown[]).length !== 1 ? "s" : ""} ·{" "}
                    <span
                      style={{
                        color:
                          exp.status === "finalized"
                            ? "var(--pos)"
                            : "var(--amber-bright)",
                      }}
                    >
                      {exp.status === "finalized" ? "finalized" : "draft"}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ height: 40 }} />

      <AddMemberSheet
        groupId={id!}
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
      />
    </div>
  );
}

export default GroupDetail;
