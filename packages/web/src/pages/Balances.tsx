import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import { useGetGroupBalances } from "@/hooks/api/useGetGroupBalances";
import { Avatar } from "@/components/dd/Avatar";
import { Sheet } from "@/components/dd/Sheet";
import { Money } from "@/components/dd/Money";
import { memberColor } from "@/lib/people";
type Member = { id: string; groupId: string; name: string };

// ─── Settle up sheet ─────────────────────────────────────────────────────────

interface SettleUpSheetProps {
  debtor: Member;
  debtorColor: string;
  payee: Member;
  payeeColor: string;
  amount: number;
  onClose: () => void;
  onPaid: () => void;
}

function SettleUpSheet({
  debtor,
  debtorColor,
  payee,
  payeeColor,
  amount,
  onClose,
  onPaid,
}: SettleUpSheetProps) {
  const [paid, setPaid] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  function markPaid() {
    setPaid(true);
    timerRef.current = setTimeout(onPaid, 1700);
  }

  return (
    <Sheet
      open
      onClose={paid ? () => {} : onClose}
      title={paid ? undefined : "Settle up"}
    >
      {paid ? (
        <div
          style={{
            textAlign: "center",
            padding: "14px 10px 24px",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "var(--pos)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
              animation: "dd-pop .5s cubic-bezier(.2,.9,.3,1) both",
            }}
          >
            <svg
              width={42}
              height={42}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#053024"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="dd-display" style={{ fontSize: 24, marginTop: 22 }}>
            Settled up!
          </div>
          <div
            style={{
              color: "var(--ink-2)",
              fontSize: 14.5,
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            {debtor.name} is all square.
          </div>
        </div>
      ) : (
        <div style={{ paddingTop: 4 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: "6px 0 18px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Avatar name={debtor.name} color={debtorColor} size={50} />
              <svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--ink-3)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ margin: "0 6px" }}
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <Avatar name={payee.name} color={payeeColor} size={50} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 14.5,
                  color: "var(--ink-2)",
                  fontWeight: 600,
                }}
              >
                {debtor.name} pays {payee.name}
              </div>
              <Money pence={amount} size={36} />
            </div>
          </div>
          <button
            onClick={markPaid}
            style={{
              width: "100%",
              padding: "15px 0",
              borderRadius: "var(--r-md)",
              background: "var(--pos)",
              color: "#053024",
              fontWeight: 800,
              fontSize: 16,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Mark as paid
          </button>
          <button
            onClick={onClose}
            style={{
              width: "100%",
              marginTop: 10,
              color: "var(--brand-bright)",
              fontSize: 14.5,
              fontWeight: 700,
              padding: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Send a reminder instead
          </button>
        </div>
      )}
    </Sheet>
  );
}

// ─── Balances page ───────────────────────────────────────────────────────────

export function Balances() {
  const { id: groupId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // payerId optionally passed via navigation state (from ReceiptReview SavedScreen)
  const payerId: string | undefined = location.state?.payerId;

  const { data, isLoading, isError } = useGetGroupBalances(groupId ?? "");

  const [settledIds, setSettledIds] = useState<string[]>([]);
  const [settling, setSettling] = useState<{
    debtor: Member;
    debtorColor: string;
    amount: number;
    balanceKey: string;
  } | null>(null);

  if (!groupId) return null;

  if (isLoading) {
    return (
      <div
        style={{
          height: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
          color: "var(--ink-3)",
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        Loading balances…
      </div>
    );
  }

  if (isError || !data || "error" in data) {
    return (
      <div
        style={{
          height: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
          color: "var(--neg)",
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        Could not load balances.
      </div>
    );
  }

  const { group, balances } = data as {
    group: { id: string; name: string; members: Member[] };
    balances: {
      fromMemberId: string;
      toMemberId: string;
      amount: number;
    }[];
  };

  const memberMap = new Map(
    group.members.map((m, i) => [m.id, { member: m, index: i }]),
  );

  // Determine "payer" perspective — default to first member if no payerId in state
  const payeeId = payerId ?? group.members[0]?.id ?? "";
  const payeeEntry = memberMap.get(payeeId);
  const payee = payeeEntry?.member;
  const payeeColor = payeeEntry ? memberColor(payeeEntry.index) : "var(--p1)";

  // Debts owed TO the payee.
  //
  // A debtor missing from `memberMap` is someone who has since been removed from
  // the group (`group.members` is active-only) — they still owe their frozen
  // share of expenses finalized while they were in it, so the row is labelled
  // rather than dropped. Dropping it made money quietly disappear from the
  // screen, with no way to settle it. (Showing their real name needs the API to
  // return former members; a placeholder is the honest interim.)
  const debts: {
    key: string;
    member: Member;
    color: string;
    amount: number;
  }[] = balances
    .filter((b) => b.toMemberId === payeeId)
    .map((b) => {
      const entry = memberMap.get(b.fromMemberId);
      return {
        key: b.fromMemberId,
        member:
          entry?.member ??
          ({
            id: b.fromMemberId,
            groupId: group.id,
            name: "Former member",
          } satisfies Member),
        color: entry ? memberColor(entry.index) : "var(--p2)",
        amount: b.amount,
      };
    });

  const unsettledDebts = debts.filter((d) => !settledIds.includes(d.key));
  const owedTotal = unsettledDebts.reduce((acc, d) => acc + d.amount, 0);

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      {/* Header */}
      <div style={{ paddingTop: "env(safe-area-inset-top, 44px)" }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 14px 6px",
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
            flexShrink: 0,
          }}
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 16.5, fontWeight: 800 }}>{group.name}</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              fontWeight: 600,
            }}
          >
            Balances
          </div>
        </div>
        <button
          onClick={() => navigate(`/groups/${groupId}`)}
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
            flexShrink: 0,
          }}
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </button>
      </div>

      <div
        className="dd-scroll"
        style={{ flex: 1, overflow: "auto", padding: "8px 20px 20px" }}
      >
        {/* Hero */}
        {debts.length > 0 ? (
          <div
            style={{
              borderRadius: "var(--r-lg)",
              padding: "20px 22px",
              background: "linear-gradient(135deg, #1F8A5E, #2BB070)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -30,
                top: -40,
                width: 150,
                height: 150,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.12)",
              }}
            />
            <div style={{ position: "relative" }}>
              <div
                style={{
                  color: "rgba(255,255,255,0.85)",
                  fontSize: 14.5,
                  fontWeight: 700,
                }}
              >
                {payee
                  ? `${payee.name} is owed in this group`
                  : "You're owed in this group"}
              </div>
              <div
                className="dd-num dd-display"
                style={{ fontSize: 42, color: "#fff", marginTop: 2 }}
              >
                £{(owedTotal / 100).toFixed(2)}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  marginTop: 8,
                  color: "rgba(255,255,255,0.9)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <svg
                  width={15}
                  height={15}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {unsettledDebts.length} still to settle
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              borderRadius: "var(--r-lg)",
              padding: "20px 22px",
              background: "var(--surface-2)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--ink)",
                marginBottom: 4,
              }}
            >
              All square!
            </div>
            <div
              style={{
                fontSize: 13.5,
                color: "var(--ink-3)",
                fontWeight: 600,
              }}
            >
              No outstanding balances in this group.
            </div>
          </div>
        )}

        {debts.length > 0 && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                padding: "22px 2px 12px",
              }}
            >
              <div className="dd-display" style={{ fontSize: 19 }}>
                Who owes {payee?.name ?? "you"}
              </div>
              {unsettledDebts.length > 1 && (
                <span
                  style={{
                    color: "var(--brand-bright)",
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Remind all
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {debts.map((d) => {
                const done = settledIds.includes(d.key);
                return (
                  <div
                    key={d.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 13,
                      background: "var(--surface)",
                      border: "1px solid var(--hairline)",
                      borderRadius: "var(--r-md)",
                      padding: "13px 15px",
                      opacity: done ? 0.6 : 1,
                      transition: "opacity .3s",
                    }}
                  >
                    <Avatar name={d.member.name} color={d.color} size={42} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>
                        {d.member.name}
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: done ? "var(--pos)" : "var(--ink-3)",
                          fontWeight: 700,
                          marginTop: 1,
                        }}
                      >
                        {done ? "Settled up ✓" : `owes ${payee?.name ?? "you"}`}
                      </div>
                    </div>
                    {done ? (
                      <Money
                        pence={d.amount}
                        size={16}
                        color="var(--ink-4)"
                        style={{ textDecoration: "line-through" }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 6,
                        }}
                      >
                        <Money pence={d.amount} size={17} color="var(--pos)" />
                        <button
                          onClick={() =>
                            setSettling({
                              debtor: d.member,
                              debtorColor: d.color,
                              amount: d.amount,
                              balanceKey: d.key,
                            })
                          }
                          style={{
                            fontSize: 12.5,
                            fontWeight: 800,
                            color: "var(--brand-bright)",
                            background: "var(--brand-wash)",
                            padding: "5px 12px",
                            borderRadius: 999,
                            border: "none",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Settle up
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div
          style={{
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            gap: 9,
            color: "var(--ink-4)",
            fontSize: 12.5,
            fontWeight: 600,
            justifyContent: "center",
          }}
        >
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink-4)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          V1 records payments — no money actually moves
        </div>
      </div>

      {settling && payee && (
        <SettleUpSheet
          debtor={settling.debtor}
          debtorColor={settling.debtorColor}
          payee={payee}
          payeeColor={payeeColor}
          amount={settling.amount}
          onClose={() => setSettling(null)}
          onPaid={() => {
            setSettledIds((s) => [...s, settling.balanceKey]);
            setSettling(null);
          }}
        />
      )}
    </div>
  );
}

export default Balances;
