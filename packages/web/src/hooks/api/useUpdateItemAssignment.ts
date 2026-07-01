import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/eden";

export const useUpdateItemAssignment = (expenseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      assignment,
    }: {
      itemId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assignment: any;
    }) =>
      api.core
        .expenses({ id: expenseId })
        .items({ itemId })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .assignment.put({ assignment } as any)
        .then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", expenseId] });
    },
  });
};
