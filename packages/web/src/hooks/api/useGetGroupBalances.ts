import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/eden";

export const useGetGroupBalances = (groupId: string) => {
  return useQuery({
    queryKey: ["groups", groupId, "balances"],
    queryFn: () =>
      api.core
        .groups({ id: groupId })
        .balances.get()
        .then((res) => res.data),
    enabled: !!groupId,
  });
};
