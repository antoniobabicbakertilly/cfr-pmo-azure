import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listProjectCloseouts, createProjectCloseout, updateProjectCloseout, deactivateProjectCloseout,
} from '../api/projectCloseouts.api';
import type { ProjectCloseoutCreate, ProjectCloseoutUpdate } from '../models/projectCloseout.model';

const QK = (projectId: string) => ['projectCloseouts', projectId] as const;

export function useProjectCloseouts(projectId: string | undefined) {
  return useQuery({
    queryKey: QK(projectId ?? ''),
    queryFn: () => listProjectCloseouts(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProjectCloseout(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectCloseoutCreate) => createProjectCloseout(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
  });
}

export function useUpdateProjectCloseout(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProjectCloseoutUpdate }) =>
      updateProjectCloseout(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
  });
}

export function useDeactivateProjectCloseout(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateProjectCloseout(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
  });
}

export function useCloseoutReadiness(projectId: string | undefined) {
  const { data: items = [] } = useProjectCloseouts(projectId);
  const total = items.length;
  const done = items.filter((i) => i.pmo_iscomplete).length;
  return { total, done, isReady: total > 0 && done >= total, items };
}
