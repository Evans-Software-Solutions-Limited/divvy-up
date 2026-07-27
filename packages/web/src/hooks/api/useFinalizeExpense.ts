import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/eden";

export const useFinalizeExpense = (expenseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    // No arguments: finalize freezes `everyone` splits server-side, so the
    // balances it returns no longer depend on a member list from the client.
    mutationFn: () =>
      api.core
        .expenses({ id: expenseId })
        .finalize.post()
        .then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", expenseId] });
    },
  });
};
