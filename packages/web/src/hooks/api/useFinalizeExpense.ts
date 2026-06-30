import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/eden";

export const useFinalizeExpense = (expenseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberIds?: string[]) =>
      api.core
        .expenses({ id: expenseId })
        .finalize.post({ memberIds })
        .then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", expenseId] });
    },
  });
};
