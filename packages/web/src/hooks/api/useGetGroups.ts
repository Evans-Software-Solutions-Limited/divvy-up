import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/eden";

export const useGetGroups = () => {
  return useQuery({
    queryKey: ["groups"],
    queryFn: () => api.core.groups.get().then((res) => res.data),
  });
};
