import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/eden";

export const useAddMember = (groupId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.core
        .groups({ id: groupId })
        .members.post({ name })
        .then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups", groupId] });
    },
  });
};
