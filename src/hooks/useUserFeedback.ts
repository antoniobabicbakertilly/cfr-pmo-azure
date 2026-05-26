import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listUserFeedback, createUserFeedback, updateUserFeedback } from '../api/userFeedback.api';
import type { UserFeedbackCreate } from '../models/userFeedback.model';

const QK = ['userFeedback'] as const;

export function useUserFeedback() {
  return useQuery({
    queryKey: QK,
    queryFn: listUserFeedback,
  });
}

export function useCreateUserFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UserFeedbackCreate) => createUserFeedback(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateUserFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; payload: Parameters<typeof updateUserFeedback>[1] }) =>
      updateUserFeedback(params.id, params.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}
