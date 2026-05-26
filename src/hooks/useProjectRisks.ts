import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listProjectRisks,
  createProjectRisk,
  updateProjectRisk,
  deleteProjectRisk,
  type ProjectRiskCreate,
  type ProjectRiskPayload,
} from '../api/projectRisks.api';
import type { ProjectRisk } from '../models/projectRisk.model';
import { toast } from './useToast';

const KEYS = {
  forProject: (projectId: string) => ['projectRisks', projectId] as const,
};

export function useProjectRisks(projectId: string | undefined) {
  return useQuery({
    queryKey: KEYS.forProject(projectId ?? ''),
    queryFn: () => listProjectRisks(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateProjectRisk(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectRiskCreate) => createProjectRisk(payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: KEYS.forProject(projectId) });
      const previous = qc.getQueryData<ProjectRisk[]>(KEYS.forProject(projectId));
      const optimistic = {
        msdyn_projectriskid: `optimistic-${Date.now()}`,
        msdyn_name: 'saving...',
        msdyn_subject: payload.msdyn_subject,
        msdyn_description: payload.msdyn_description,
        statecode: 0,
        createdon: new Date().toISOString(),
        _msdyn_project_value: projectId,
        _saving: true,
      } as unknown as ProjectRisk;
      qc.setQueryData<ProjectRisk[]>(KEYS.forProject(projectId), (old) => [optimistic, ...(old ?? [])]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData<ProjectRisk[]>(KEYS.forProject(projectId), ctx.previous);
      toast.error('Failed to save risk. Please try again.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.forProject(projectId) }),
  });
}

export function useUpdateProjectRisk(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProjectRiskPayload }) =>
      updateProjectRisk(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.forProject(projectId) }),
    onError: () => toast.error('Failed to update risk. Please try again.'),
  });
}

export function useDeleteProjectRisk(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProjectRisk(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.forProject(projectId) }),
    onError: () => toast.error('Failed to delete risk. Please try again.'),
  });
}
