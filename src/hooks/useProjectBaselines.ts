import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listProjectBaselines, createProjectBaseline } from '../api/projectBaselines.api';
import type { ProjectBaselineCreate } from '../models/projectBaseline.model';

const QK = (projectId: string) => ['projectBaselines', projectId] as const;

export function useProjectBaselines(projectId: string | undefined) {
  return useQuery({
    queryKey: QK(projectId ?? ''),
    queryFn: () => listProjectBaselines(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProjectBaseline(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectBaselineCreate) => createProjectBaseline(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
  });
}
