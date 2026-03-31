import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  IconArrowRight,
  IconCalendar,
  IconCurrencyDollar,
} from "@tabler/icons-react";

/**
 * Mock receipt data for demonstration
 */
const MOCK_RECEIPT = {
  merchant: "Trattoria Roma",
  date: "2026-03-26",
  currency: "USD",
  subtotal: 9500, // cents
  tax: 1200,
  tip: 0,
  total: 10700,
  items: [
    {
      id: "item-1",
      description: "Pasta Carbonara",
      unitPrice: 1800,
      quantity: 1,
    },
    { id: "item-2", description: "Caesar Salad", unitPrice: 1200, quantity: 1 },
    { id: "item-3", description: "House Wine", unitPrice: 2400, quantity: 2 },
    { id: "item-4", description: "Espresso", unitPrice: 400, quantity: 2 },
  ],
};

const MOCK_MEMBERS = [
  { id: "member-1", name: "Alice" },
  { id: "member-2", name: "Bob" },
  { id: "member-3", name: "Charlie" },
];

type SplitMode = "one" | "equal" | "everyone" | "custom";

interface ItemAssignment {
  itemId: string;
  mode: SplitMode;
  assignedMemberIds: string[];
  customShares?: Record<string, number>; // member id -> fraction
}

interface ReceiptReviewProps {
  onFinalize?: (balances: CalculatedBalance[]) => void;
}

interface CalculatedBalance {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

/**
 * Calculate who owes whom based on current item assignments.
 * Returns a simplified balance sheet.
 */
function calculateBalances(
  items: typeof MOCK_RECEIPT.items,
  assignments: ItemAssignment[],
  taxAmount: number,
  tipAmount: number,
  discountAmount: number,
): CalculatedBalance[] {
  // Create a map of member->total owed
  const owedByMember: Record<string, number> = {};
  MOCK_MEMBERS.forEach((m) => {
    owedByMember[m.id] = 0;
  });

  // First, assign item costs
  assignments.forEach((assignment) => {
    const item = items.find((i) => i.id === assignment.itemId);
    if (!item) return;

    const itemTotal = item.unitPrice * item.quantity;

    if (assignment.mode === "one") {
      owedByMember[assignment.assignedMemberIds[0]] += itemTotal;
    } else if (assignment.mode === "equal") {
      const perPerson = itemTotal / assignment.assignedMemberIds.length;
      assignment.assignedMemberIds.forEach((memberId) => {
        owedByMember[memberId] += perPerson;
      });
    } else if (assignment.mode === "everyone") {
      const perPerson = itemTotal / MOCK_MEMBERS.length;
      MOCK_MEMBERS.forEach((m) => {
        owedByMember[m.id] += perPerson;
      });
    } else if (assignment.mode === "custom" && assignment.customShares) {
      Object.entries(assignment.customShares).forEach(
        ([memberId, fraction]) => {
          owedByMember[memberId] += itemTotal * fraction;
        },
      );
    }
  });

  // Distribute tax proportionally
  const totalOwed = Object.values(owedByMember).reduce((a, b) => a + b, 0);
  if (totalOwed > 0) {
    Object.keys(owedByMember).forEach((memberId) => {
      owedByMember[memberId] +=
        (taxAmount * owedByMember[memberId]) / totalOwed;
    });
  }

  // Distribute tip evenly (simple approach)
  const tipPerPerson = tipAmount / MOCK_MEMBERS.length;
  MOCK_MEMBERS.forEach((m) => {
    owedByMember[m.id] += tipPerPerson;
  });

  // Apply discount evenly
  const discountPerPerson = discountAmount / MOCK_MEMBERS.length;
  MOCK_MEMBERS.forEach((m) => {
    owedByMember[m.id] -= discountPerPerson;
  });

  // Convert individual oweds to pairwise balances
  // For simplicity: first member (payer) is the reference; others owe them
  const payer = MOCK_MEMBERS[0];
  const balances: CalculatedBalance[] = [];

  MOCK_MEMBERS.forEach((member) => {
    if (member.id !== payer.id && owedByMember[member.id] > 0) {
      balances.push({
        fromMemberId: member.id,
        toMemberId: payer.id,
        amount: Math.round(owedByMember[member.id]),
      });
    }
  });

  return balances;
}

export function ReceiptReview({ onFinalize }: ReceiptReviewProps) {
  const [assignments, setAssignments] = useState<ItemAssignment[]>(
    MOCK_RECEIPT.items.map((item) => ({
      itemId: item.id,
      mode: "everyone" as SplitMode,
      assignedMemberIds: MOCK_MEMBERS.map((m) => m.id),
    })),
  );

  const [tax, setTax] = useState(MOCK_RECEIPT.tax);
  const [tip, setTip] = useState(MOCK_RECEIPT.tip);
  const [discount, setDiscount] = useState(0);

  const [showFinalize, setShowFinalize] = useState(false);

  const balances = useMemo(() => {
    return calculateBalances(
      MOCK_RECEIPT.items,
      assignments,
      tax,
      tip,
      discount,
    );
  }, [assignments, tax, tip, discount]);

  const handleAssignmentChange = (
    itemId: string,
    mode: SplitMode,
    memberIds?: string[],
  ) => {
    setAssignments((prev) =>
      prev.map((a) =>
        a.itemId === itemId
          ? {
              ...a,
              mode,
              assignedMemberIds: memberIds || a.assignedMemberIds,
            }
          : a,
      ),
    );
  };

  const handleFinalize = () => {
    if (onFinalize) {
      onFinalize(balances);
    }
    setShowFinalize(false);
  };

  const getItemAssignment = (itemId: string) => {
    return assignments.find((a) => a.itemId === itemId);
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-6 pb-4">
      {/* Receipt Header */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-lg">
            {MOCK_RECEIPT.merchant || "Receipt"}
          </CardTitle>
          <CardDescription className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <IconCalendar className="size-3.5" />
              {MOCK_RECEIPT.date}
            </span>
            <span className="inline-flex items-center gap-1">
              <IconCurrencyDollar className="size-3.5" />
              {MOCK_RECEIPT.currency}
            </span>
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Items Section */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {MOCK_RECEIPT.items.map((item) => {
            const assignment = getItemAssignment(item.id);
            const itemTotal = item.unitPrice * item.quantity;

            return (
              <div
                key={item.id}
                className="space-y-3 rounded-xl border border-border bg-muted/20 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">
                      {item.description}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.quantity} &times; {formatCurrency(item.unitPrice)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {formatCurrency(itemTotal)}
                  </Badge>
                </div>

                {assignment && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Split mode
                      </Label>
                      <Select
                        value={assignment.mode}
                        onValueChange={(mode) =>
                          handleAssignmentChange(
                            item.id,
                            mode as SplitMode,
                            undefined,
                          )
                        }
                      >
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one">One Person</SelectItem>
                          <SelectItem value="equal">Equal Split</SelectItem>
                          <SelectItem value="everyone">Everyone</SelectItem>
                          <SelectItem value="custom">Custom Shares</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {assignment.mode === "one" && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Assign to
                        </Label>
                        <Select
                          value={assignment.assignedMemberIds[0] || ""}
                          onValueChange={(memberId) =>
                            handleAssignmentChange(item.id, "one", [memberId])
                          }
                        >
                          <SelectTrigger className="mt-1 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MOCK_MEMBERS.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {assignment.mode === "equal" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Split among
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {MOCK_MEMBERS.map((member) => {
                            const isSelected =
                              assignment.assignedMemberIds.includes(member.id);
                            return (
                              <button
                                key={member.id}
                                type="button"
                                onClick={() => {
                                  const newIds = isSelected
                                    ? assignment.assignedMemberIds.filter(
                                        (id) => id !== member.id,
                                      )
                                    : [
                                        ...assignment.assignedMemberIds,
                                        member.id,
                                      ];
                                  handleAssignmentChange(
                                    item.id,
                                    "equal",
                                    newIds,
                                  );
                                }}
                                className={`rounded-4xl border px-3 py-1 text-xs font-medium transition-colors ${
                                  isSelected
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-background text-muted-foreground hover:border-foreground/20"
                                }`}
                              >
                                {member.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <p className="text-[0.7rem] text-muted-foreground">
                      {assignment.mode === "everyone" &&
                        "Split evenly among all members"}
                      {assignment.mode === "one" &&
                        `Assigned to ${MOCK_MEMBERS.find((m) => m.id === assignment.assignedMemberIds[0])?.name}`}
                      {assignment.mode === "equal" &&
                        `Split among ${assignment.assignedMemberIds.length} member(s)`}
                      {assignment.mode === "custom" &&
                        "Custom shares configured"}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Adjustments Section */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>Adjustments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Tax</Label>
              <Input
                type="number"
                value={tax / 100}
                onChange={(e) =>
                  setTax(Math.round(parseFloat(e.target.value) * 100))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tip</Label>
              <Input
                type="number"
                value={tip / 100}
                onChange={(e) =>
                  setTip(Math.round(parseFloat(e.target.value) * 100))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Discount</Label>
              <Input
                type="number"
                value={discount / 100}
                onChange={(e) =>
                  setDiscount(Math.round(parseFloat(e.target.value) * 100))
                }
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Balances Summary */}
      <Card className="border-primary/20 bg-primary/5" size="sm">
        <CardHeader>
          <CardTitle>Who Owes What</CardTitle>
        </CardHeader>
        <CardContent>
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Everyone is even (or no assignments yet)
            </p>
          ) : (
            <div className="space-y-2">
              {balances.map((balance, i) => {
                const fromName = MOCK_MEMBERS.find(
                  (m) => m.id === balance.fromMemberId,
                )?.name;
                const toName = MOCK_MEMBERS.find(
                  (m) => m.id === balance.toMemberId,
                )?.name;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium">{fromName}</span>
                      <IconArrowRight className="size-3.5 text-muted-foreground" />
                      <span className="font-medium">{toName}</span>
                    </span>
                    <span className="tabular-nums font-semibold">
                      {formatCurrency(balance.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totals Footer */}
      <Card size="sm">
        <CardContent>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">
                {formatCurrency(MOCK_RECEIPT.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span className="tabular-nums">{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tip</span>
              <span className="tabular-nums">{formatCurrency(tip)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span className="tabular-nums">
                &minus;{formatCurrency(discount)}
              </span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {formatCurrency(MOCK_RECEIPT.subtotal + tax + tip - discount)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1">
          Cancel
        </Button>
        <Button onClick={() => setShowFinalize(true)} className="flex-1">
          Finalize Expense
        </Button>
      </div>

      {/* Finalize Confirmation Dialog */}
      <AlertDialog open={showFinalize} onOpenChange={setShowFinalize}>
        <AlertDialogContent>
          <AlertDialogTitle>Finalize Expense?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>Review the balances below and confirm:</p>
              {balances.map((balance, i) => {
                const fromName = MOCK_MEMBERS.find(
                  (m) => m.id === balance.fromMemberId,
                )?.name;
                const toName = MOCK_MEMBERS.find(
                  (m) => m.id === balance.toMemberId,
                )?.name;
                return (
                  <p key={i}>
                    <span className="font-medium">{fromName}</span> &rarr;{" "}
                    <span className="font-medium">{toName}</span>:{" "}
                    {formatCurrency(balance.amount)}
                  </p>
                );
              })}
            </div>
          </AlertDialogDescription>
          <div className="flex gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalize}>
              Confirm
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
