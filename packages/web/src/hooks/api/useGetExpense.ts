import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/eden";

export const useGetExpense = (id: string) => {
  return useQuery({
    queryKey: ["expenses", id],
    queryFn: () =>
      api.core
        .expenses({ id })
        .get()
        .then((res) => res.data),
    enabled: !!id,
  });
};
