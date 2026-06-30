import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/eden";

export const useCreateExpense = (groupId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      payerId: string;
      description: string;
      date: string;
      currency?: string;
      merchant?: string;
      items: Array<{
        description: string;
        unitPrice: number;
        quantity: number;
        assignment: unknown;
      }>;
      adjustments?: Array<{
        kind: "tax" | "tip" | "discount";
        amount: number;
        isPercent: boolean;
      }>;
    }) =>
      api.core.expenses
        .post({ groupId, currency: "GBP", ...input })
        .then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["groups", groupId, "expenses"],
      });
    },
  });
};
