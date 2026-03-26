// Receipt review screen — lets users inspect and adjust OCR-extracted items
// before assigning them to group members and finalizing the expense.
//
// Full wiring to the API is deferred; this scaffold defines the UI contract
// and data shapes the screen expects.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { IconCheck, IconReceipt } from "@tabler/icons-react";

// ─── Local types (mirror the API response shape) ──────────────────────────────

type ExtractedItem = {
  id: string;
  description: string;
  unitPrice: number;
  quantity: number;
  /** null until the user confirms an assignment */
  assignment: ItemAssignment | null;
};

type ItemAssignment =
  | { type: "one"; memberId: string }
  | { type: "equal"; memberIds: string[] }
  | { type: "everyone" }
  | { type: "custom"; shares: { memberId: string; fraction: number }[] };

type ReceiptDraft = {
  merchant: string | null;
  date: string | null;
  currency: string;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  items: ExtractedItem[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMinorAmount(minorUnits: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minorUnits / 100);
}

function assignmentLabel(a: ItemAssignment | null): string {
  if (!a) return "Unassigned";
  if (a.type === "one") return `1 person`;
  if (a.type === "equal") return `${a.memberIds.length} people (equal)`;
  if (a.type === "everyone") return "Everyone";
  return `Custom (${a.shares.length} shares)`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function LineItemRow({
  item,
  currency,
}: {
  item: ExtractedItem;
  currency: string;
}) {
  const lineTotal = item.unitPrice * item.quantity;
  const assigned = item.assignment !== null;

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.description}</p>
        <p className="text-muted-foreground text-xs">
          {item.quantity} × {formatMinorAmount(item.unitPrice, currency)}
          {" · "}
          <span className={assigned ? "text-green-600" : "text-amber-600"}>
            {assignmentLabel(item.assignment)}
          </span>
        </p>
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums">
        {formatMinorAmount(lineTotal, currency)}
      </span>
    </div>
  );
}

// ─── Placeholder data (replaced by API call in real implementation) ───────────

const PLACEHOLDER: ReceiptDraft = {
  merchant: "Bella Italia",
  date: "2026-03-26",
  currency: "USD",
  subtotal: 6200,
  tax: 558,
  tip: 0,
  total: 6758,
  items: [
    {
      id: "item-1",
      description: "Spaghetti Carbonara",
      unitPrice: 1800,
      quantity: 1,
      assignment: null,
    },
    {
      id: "item-2",
      description: "Margherita Pizza",
      unitPrice: 1600,
      quantity: 1,
      assignment: { type: "everyone" },
    },
    {
      id: "item-3",
      description: "Tiramisu",
      unitPrice: 900,
      quantity: 2,
      assignment: {
        type: "equal",
        memberIds: ["member-1", "member-2"],
      },
    },
    {
      id: "item-4",
      description: "House Red Wine",
      unitPrice: 1000,
      quantity: 1,
      assignment: null,
    },
  ],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ReceiptReview() {
  // TODO: replace with useParams + useExtractReceipt / useGetExpense hook
  const draft = PLACEHOLDER;

  const unassignedCount = draft.items.filter((i) => !i.assignment).length;
  const allAssigned = unassignedCount === 0;

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <IconReceipt className="h-5 w-5 opacity-60" />
            <h1 className="text-xl font-semibold">
              {draft.merchant ?? "Receipt"}
            </h1>
          </div>
          {draft.date && (
            <p className="text-muted-foreground text-sm">{draft.date}</p>
          )}
        </div>
        {!allAssigned && (
          <Badge variant="outline" className="shrink-0 text-amber-600">
            {unassignedCount} unassigned
          </Badge>
        )}
        {allAssigned && (
          <Badge variant="outline" className="shrink-0 text-green-600">
            All assigned
          </Badge>
        )}
      </div>

      {/* Line items */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wide opacity-60">
            Items
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y px-4 pb-4">
          {draft.items.map((item) => (
            <LineItemRow key={item.id} item={item} currency={draft.currency} />
          ))}
        </CardContent>
      </Card>

      {/* Totals */}
      <Card className="mb-6">
        <CardContent className="space-y-1 px-4 py-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatMinorAmount(draft.subtotal, draft.currency)}</span>
          </div>
          {draft.tax > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatMinorAmount(draft.tax, draft.currency)}</span>
            </div>
          )}
          {draft.tip > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tip</span>
              <span>{formatMinorAmount(draft.tip, draft.currency)}</span>
            </div>
          )}
          <Separator className="my-2" />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{formatMinorAmount(draft.total, draft.currency)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Finalize CTA */}
      <Button className="w-full" disabled={!allAssigned}>
        <IconCheck data-icon="inline-start" />
        Finalize expense
      </Button>
      {!allAssigned && (
        <p className="text-muted-foreground mt-2 text-center text-xs">
          Assign all items before finalizing.
        </p>
      )}
    </div>
  );
}

export default ReceiptReview;
