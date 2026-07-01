import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/eden";

export const useCreateGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.core.groups.post({ name }).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
};
