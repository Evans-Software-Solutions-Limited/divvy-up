import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/eden";

export const useGetGroupExpenses = (groupId: string) => {
  return useQuery({
    queryKey: ["groups", groupId, "expenses"],
    queryFn: () =>
      api.core
        .groups({ id: groupId })
        .expenses.get()
        .then((res) => res.data),
    enabled: !!groupId,
  });
};
