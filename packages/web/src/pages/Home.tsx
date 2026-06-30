import { useState } from "react";
import { useNavigate } from "react-router";
import { useGetGroups } from "@/hooks/api/useGetGroups";
import { useCreateGroup } from "@/hooks/api/useCreateGroup";
import { Avatar, AvatarStack } from "@/components/dd/Avatar";
import { Sheet } from "@/components/dd/Sheet";
import { memberColor } from "@/lib/people";
import {
  IconBell,
  IconPlus,
  IconCamera,
  IconReceipt,
  IconArrowRight,
  IconHome,
  IconLayoutGrid,
  IconActivity,
  IconUser,
} from "@tabler/icons-react";

// ── TabBar ────────────────────────────────────────────────────────────────────

export function TabBar({
  active,
}: {
  active: "home" | "groups" | "activity" | "profile";
}) {
  const navigate = useNavigate();
  return (
    <div
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40 }}
    >
      <div
        style={{
          background: "var(--bg-2)",
          borderTop: "1px solid var(--hairline)",
          boxShadow: "0 -6px 20px rgba(0,0,0,0.22)",
          height: 64,
          paddingBottom: 8,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-around",
          paddingTop: 9,
        }}
      >
        <TabItem
          icon={<IconHome size={23} />}
          label="Home"
          isActive={active === "home"}
          onClick={() => navigate("/")}
        />
        <TabItem
          icon={<IconLayoutGrid size={23} />}
          label="Groups"
          isActive={active === "groups"}
          onClick={() => navigate("/groups")}
        />

        {/* scan FAB */}
        <button
          onClick={() => navigate("/scan")}
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            marginTop: -4,
            background: "linear-gradient(135deg, #FF9F5A, #FFBE85)",
            boxShadow: "0 8px 22px rgba(255,159,90,0.42)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            cursor: "pointer",
          }}
        >
          <IconCamera size={25} color="#3A1B02" />
        </button>

        <TabItem
          icon={<IconActivity size={23} />}
          label="Activity"
          isActive={active === "activity"}
          onClick={() => navigate("/activity")}
        />
        <TabItem
          icon={<IconUser size={23} />}
          label="Profile"
          isActive={active === "profile"}
          onClick={() => navigate("/profile")}
        />
      </div>
    </div>
  );
}

function TabItem({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        width: 60,
        padding: "2px 0",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: isActive ? "var(--brand-bright)" : "var(--ink-3)",
      }}
    >
      {icon}
      <span style={{ fontSize: 10.5, fontWeight: 700 }}>{label}</span>
    </button>
  );
}

// ── CreateGroupSheet ──────────────────────────────────────────────────────────

function CreateGroupSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const createGroup = useCreateGroup();

  async function handleCreate() {
    if (!name.trim()) return;
    const group = await createGroup.mutateAsync(name.trim());
    onClose();
    setName("");
    if (group) navigate(`/groups/${(group as { id: string }).id}`);
  }

  return (
    <Sheet open={open} onClose={onClose} title="New group">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Group name"
          style={{
            width: "100%",
            background: "var(--surface)",
            border: "1px solid var(--hairline-2)",
            borderRadius: 14,
            padding: "14px 16px",
            color: "var(--ink)",
            fontSize: 19,
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            outline: "none",
          }}
        />
        <p
          style={{
            color: "var(--ink-3)",
            fontSize: 13.5,
            fontWeight: 600,
            margin: 0,
          }}
        >
          You can add members after creating the group.
        </p>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || createGroup.isPending}
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
          }}
        >
          {createGroup.isPending ? "Creating…" : "Create group"}
        </button>
      </div>
    </Sheet>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────

export function Home() {
  const { isLoading, data: groups } = useGetGroups();
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 20px 8px",
        }}
      >
        <div>
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
          <div
            className="dd-display"
            style={{ fontSize: 27, lineHeight: 1.05 }}
          >
            My groups
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            style={{
              width: 42,
              height: 42,
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
            <IconBell size={20} />
          </button>
          <Avatar name="You" color="var(--p1)" size={42} />
        </div>
      </div>

      {/* scan CTA */}
      <div style={{ padding: "10px 20px 4px" }}>
        <button
          onClick={() => navigate("/scan")}
          style={{
            width: "100%",
            borderRadius: "var(--r-lg)",
            padding: "17px 20px",
            display: "flex",
            alignItems: "center",
            gap: 15,
            background: "linear-gradient(110deg, #FF9F5A, #FFBE85)",
            boxShadow: "0 10px 30px rgba(255,159,90,0.34)",
            textAlign: "left",
            border: "none",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 15,
              background: "rgba(255,255,255,0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <IconCamera size={27} color="#3A1B02" />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                color: "#3A1B02",
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "-0.01em",
              }}
            >
              Scan a receipt
            </div>
            <div
              style={{
                color: "rgba(58,27,2,0.7)",
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              Mark it up · snap · AI splits it
            </div>
          </div>
          <IconArrowRight size={22} color="#3A1B02" />
        </button>
      </div>

      {/* groups */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "22px 20px 11px",
        }}
      >
        <div className="dd-display" style={{ fontSize: 19 }}>
          Your groups
        </div>
        <button
          onClick={() => setCreateOpen(true)}
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
          <IconPlus size={16} /> New group
        </button>
      </div>

      <div
        style={{
          padding: "0 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {isLoading && (
          <p style={{ color: "var(--ink-3)", fontSize: 14 }}>Loading…</p>
        )}

        {!isLoading && (!groups || groups.length === 0) && (
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
              <IconReceipt size={40} color="var(--ink-4)" />
            </div>
            <p style={{ fontWeight: 600, margin: "0 0 4px" }}>No groups yet</p>
            <p style={{ color: "var(--ink-3)", fontSize: 14, margin: 0 }}>
              Create a group to start splitting expenses.
            </p>
          </div>
        )}

        {groups?.map((g) => {
          const members =
            (g as { members: Array<{ name: string }> }).members ?? [];
          const memberObjs = members.map((m, i) => ({
            name: m.name,
            color: memberColor(i),
          }));
          return (
            <button
              key={g.id}
              onClick={() => navigate(`/groups/${g.id}`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
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
                  width: 46,
                  height: 46,
                  borderRadius: 13,
                  background: "var(--surface-2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <IconReceipt size={22} color="var(--brand-bright)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16.5, fontWeight: 700 }}>{g.name}</div>
                <div
                  style={{
                    color: "var(--ink-3)",
                    fontSize: 13,
                    fontWeight: 600,
                    marginTop: 1,
                  }}
                >
                  {members.length === 0
                    ? "No members yet"
                    : `${members.length} member${members.length !== 1 ? "s" : ""}`}
                </div>
              </div>
              {memberObjs.length > 0 && (
                <AvatarStack members={memberObjs} size={26} max={4} />
              )}
            </button>
          );
        })}
      </div>

      <div style={{ height: 96 }} />
      <TabBar active="home" />
      <CreateGroupSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}

export default Home;
