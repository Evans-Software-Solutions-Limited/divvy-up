import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/eden";

export const useGetGroup = (id: string | undefined) => {
  return useQuery({
    queryKey: ["groups", id],
    queryFn: () =>
      api.core
        .groups({ id: id! })
        .get()
        .then((res) => res.data),
    enabled: !!id,
  });
};
