import { useState, useMemo } from "react";
import { useParams, useLocation } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/eden";
import { computeBalancesPreview } from "@/lib/balances";
import type { Balance, Expense, ItemAssignment, Member } from "@divvy-up/core";

type SplitMode = ItemAssignment["type"];

interface FinalizeResult {
  expense: Expense;
  balances: Balance[];
}

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ReceiptReview() {
  const { id: expenseId } = useParams<{ id: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  // Members are passed via navigation state from the upstream flow.
  // Until group member persistence is wired, the caller must supply them.
  const members: Member[] = useMemo(
    () => (location.state as { members?: Member[] })?.members ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const {
    data: expense,
    isLoading,
    error,
  } = useQuery<Expense>({
    queryKey: ["expense", expenseId],
    queryFn: async () => {
      const res = await api.core.expenses({ id: expenseId! }).get();
      if (res.error) throw new Error("Expense not found");
      return res.data as Expense;
    },
    enabled: !!expenseId,
  });

  // Local assignment overrides so the user can reassign items before finalizing.
  // Keyed by itemId; falls back to the expense's stored assignment.
  const [localAssignments, setLocalAssignments] = useState<
    Record<string, ItemAssignment>
  >({});

  const [showFinalize, setShowFinalize] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(
    null,
  );

  const assignmentMutation = useMutation({
    mutationFn: async ({
      itemId,
      assignment,
    }: {
      itemId: string;
      assignment: ItemAssignment;
    }) => {
      if (!expenseId) return;
      await api.core
        .expenses({ id: expenseId })
        .items({ itemId })
        .assignment.put({ assignment });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!expenseId) throw new Error("No expense id");
      if (members.length === 0) throw new Error("No members");
      const res = await api.core
        .expenses({ id: expenseId })
        .finalize.post({ memberIds: members.map((m) => m.id) });
      if (res.error) throw new Error("Finalize failed");
      return res.data as FinalizeResult;
    },
    onSuccess: (data) => {
      setFinalizeResult(data);
      setShowFinalize(false);
      queryClient.setQueryData(["expense", expenseId], data.expense);
    },
  });

  // Build the effective expense (expense + local assignment overrides) for preview.
  const effectiveExpense = useMemo((): Expense | null => {
    if (!expense) return null;
    return {
      ...expense,
      items: expense.items.map((item) => ({
        ...item,
        assignment: localAssignments[item.id] ?? item.assignment,
      })),
    };
  }, [expense, localAssignments]);

  const previewBalances = useMemo(() => {
    if (!effectiveExpense || members.length === 0) return [];
    return computeBalancesPreview(effectiveExpense, members);
  }, [effectiveExpense, members]);

  const displayBalances = finalizeResult?.balances ?? null;

  function handleAssignmentChange(itemId: string, assignment: ItemAssignment) {
    setLocalAssignments((prev) => ({ ...prev, [itemId]: assignment }));
    assignmentMutation.mutate({ itemId, assignment });
  }

  function buildAssignment(
    _itemId: string,
    mode: SplitMode,
    current: ItemAssignment,
  ): ItemAssignment {
    if (mode === "one") {
      const memberId =
        current.type === "one" ? current.memberId : (members[0]?.id ?? "");
      return { type: "one", memberId };
    }
    if (mode === "equal") {
      const memberIds =
        current.type === "equal" ? current.memberIds : members.map((m) => m.id);
      return { type: "equal", memberIds };
    }
    if (mode === "everyone") {
      return { type: "everyone" };
    }
    // custom — start from existing shares or empty
    const shares = current.type === "custom" ? current.shares : [];
    return { type: "custom", shares };
  }

  if (!expenseId)
    return <p className="p-6 text-red-600">No expense id in URL.</p>;
  if (isLoading) return <p className="p-6 text-gray-500">Loading expense…</p>;
  if (error || !expense)
    return <p className="p-6 text-red-600">Expense not found.</p>;

  const subtotal = expense.items.reduce(
    (sum, i) => sum + i.unitPrice * i.quantity,
    0,
  );
  const taxTotal = expense.adjustments
    .filter((a) => a.kind === "tax")
    .reduce(
      (sum, a) =>
        sum +
        (a.isPercent ? Math.round((subtotal * a.amount) / 100) : a.amount),
      0,
    );
  const tipTotal = expense.adjustments
    .filter((a) => a.kind === "tip")
    .reduce(
      (sum, a) =>
        sum +
        (a.isPercent ? Math.round((subtotal * a.amount) / 100) : a.amount),
      0,
    );
  const discountTotal = expense.adjustments
    .filter((a) => a.kind === "discount")
    .reduce(
      (sum, a) =>
        sum +
        (a.isPercent ? Math.round((subtotal * a.amount) / 100) : a.amount),
      0,
    );
  const grandTotal = subtotal + taxTotal + tipTotal - discountTotal;

  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.name ?? id;

  const canFinalize = members.length > 0 && expense.status !== "finalized";

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Receipt Header */}
      <Card>
        <CardHeader>
          <CardTitle>{expense.merchant ?? "Receipt"}</CardTitle>
          <div className="text-sm text-gray-600 space-y-1">
            <p>Date: {expense.date}</p>
            <p>Currency: {expense.currency}</p>
            {expense.status === "finalized" && (
              <p className="text-green-600 font-medium">Finalized</p>
            )}
          </div>
        </CardHeader>
      </Card>

      {members.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No group members available — balance preview is disabled. Pass members
          via navigation state to enable splitting.
        </div>
      )}

      {/* Items Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {expense.items.map((item) => {
            const assignment = localAssignments[item.id] ?? item.assignment;
            const itemTotal = item.unitPrice * item.quantity;

            return (
              <div key={item.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{item.description}</p>
                    <p className="text-sm text-gray-600">
                      {item.quantity} × {formatCurrency(item.unitPrice)} ={" "}
                      {formatCurrency(itemTotal)}
                    </p>
                  </div>
                  <p className="font-semibold">{formatCurrency(itemTotal)}</p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm">
                    <Label className="text-gray-700">Split Mode</Label>
                    <Select
                      value={assignment.type}
                      onValueChange={(mode) =>
                        handleAssignmentChange(
                          item.id,
                          buildAssignment(
                            item.id,
                            mode as SplitMode,
                            assignment,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="mt-1">
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

                  {assignment.type === "one" && (
                    <div>
                      <Label className="text-sm">Assign to</Label>
                      <Select
                        value={assignment.memberId}
                        onValueChange={(memberId) =>
                          handleAssignmentChange(item.id, {
                            type: "one",
                            memberId,
                          })
                        }
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {assignment.type === "equal" && (
                    <div className="space-y-2">
                      <Label className="text-sm">Split among</Label>
                      <div className="space-y-1">
                        {members.map((member) => (
                          <label
                            key={member.id}
                            className="flex items-center space-x-2"
                          >
                            <input
                              type="checkbox"
                              checked={assignment.memberIds.includes(member.id)}
                              onChange={(e) => {
                                const newIds = e.target.checked
                                  ? [...assignment.memberIds, member.id]
                                  : assignment.memberIds.filter(
                                      (id) => id !== member.id,
                                    );
                                handleAssignmentChange(item.id, {
                                  type: "equal",
                                  memberIds: newIds,
                                });
                              }}
                            />
                            <span className="text-sm">{member.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-600 mt-2">
                    {assignment.type === "everyone" &&
                      "Split evenly among all members"}
                    {assignment.type === "one" &&
                      `Assigned to ${memberName(assignment.memberId)}`}
                    {assignment.type === "equal" &&
                      `Split among ${assignment.memberIds.length} member(s)`}
                    {assignment.type === "custom" && "Custom shares configured"}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Adjustments (read-only from the expense record) */}
      {expense.adjustments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Adjustments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {expense.adjustments.map((adj, i) => (
              <div key={i} className="flex justify-between">
                <span className="capitalize">{adj.kind}</span>
                <span>
                  {adj.kind === "discount" ? "-" : ""}
                  {adj.isPercent
                    ? `${adj.amount}%`
                    : formatCurrency(adj.amount)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Balances — preview until finalized, then authoritative */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-lg">
            {displayBalances ? "Final Balances" : "Balance Preview"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Add members to see balance preview.
            </p>
          ) : (displayBalances ?? previewBalances).length === 0 ? (
            <p className="text-gray-600 text-sm">
              Everyone is even (or no assignments yet).
            </p>
          ) : (
            <div className="space-y-2">
              {(displayBalances ?? previewBalances).map((balance, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>
                    <strong>{memberName(balance.fromMemberId)}</strong> owes{" "}
                    <strong>{memberName(balance.toMemberId)}</strong>
                  </span>
                  <span className="font-semibold">
                    {formatCurrency(balance.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totals Footer */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {taxTotal > 0 && (
              <div className="flex justify-between">
                <span>Tax:</span>
                <span>{formatCurrency(taxTotal)}</span>
              </div>
            )}
            {tipTotal > 0 && (
              <div className="flex justify-between">
                <span>Tip:</span>
                <span>{formatCurrency(tipTotal)}</span>
              </div>
            )}
            {discountTotal > 0 && (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span>-{formatCurrency(discountTotal)}</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between font-semibold text-base">
              <span>Total:</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {expense.status !== "finalized" && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => setShowFinalize(true)}
            className="flex-1 bg-green-600 hover:bg-green-700"
            disabled={!canFinalize || finalizeMutation.isPending}
          >
            {finalizeMutation.isPending ? "Finalizing…" : "Finalize Expense"}
          </Button>
        </div>
      )}

      {finalizeMutation.isError && (
        <p className="text-red-600 text-sm">
          Finalize failed. Please try again.
        </p>
      )}

      {/* Finalize Confirmation Dialog */}
      <AlertDialog open={showFinalize} onOpenChange={setShowFinalize}>
        <AlertDialogContent>
          <AlertDialogTitle>Finalize Expense?</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="space-y-2">
              <p>Review the balances below and confirm:</p>
              {previewBalances.map((balance, i) => (
                <p key={i}>
                  <strong>{memberName(balance.fromMemberId)}</strong> →{" "}
                  <strong>{memberName(balance.toMemberId)}</strong>:{" "}
                  {formatCurrency(balance.amount)}
                </p>
              ))}
            </div>
          </AlertDialogDescription>
          <div className="flex gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => finalizeMutation.mutate()}
              className="bg-green-600"
              disabled={!canFinalize || finalizeMutation.isPending}
            >
              Confirm
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
