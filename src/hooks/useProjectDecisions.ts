import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listProjectDecisions, createProjectDecision, updateProjectDecision, deactivateProjectDecision } from '../api/projectDecisions.api';
import type { ProjectDecision, ProjectDecisionCreate, ProjectDecisionUpdate } from '../models/projectDecision.model';
import { toast } from './useToast';

const QK = (projectId: string) => ['projectDecisions', projectId] as const;

export function useProjectDecisions(projectId: string | undefined) {
  return useQuery({
    queryKey: QK(projectId ?? ''),
    queryFn: () => listProjectDecisions(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProjectDecision(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectDecisionCreate) => createProjectDecision(payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: QK(projectId) });
      const previous = qc.getQueryData<ProjectDecision[]>(QK(projectId));
      const optimistic = {
        pmo_projectdecisionid: `optimistic-${Date.now()}`,
        pmo_name: payload.pmo_name,
        pmo_description: payload.pmo_description,
        pmo_status: payload.pmo_status,
        pmo_decisiondate: payload.pmo_decisiondate,
        statecode: 0,
        createdon: new Date().toISOString(),
        _pmo_project_value: projectId,
        _saving: true,
      } as unknown as ProjectDecision;
      qc.setQueryData<ProjectDecision[]>(QK(projectId), (old) => [optimistic, ...(old ?? [])]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData<ProjectDecision[]>(QK(projectId), ctx.previous);
      toast.error('Failed to save decision. Please try again.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
  });
}

export function useUpdateProjectDecision(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProjectDecisionUpdate }) =>
      updateProjectDecision(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
    onError: () => toast.error('Failed to update decision. Please try again.'),
  });
}

export function useDeactivateProjectDecision(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateProjectDecision(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
    onError: () => toast.error('Failed to delete decision. Please try again.'),
  });
}
