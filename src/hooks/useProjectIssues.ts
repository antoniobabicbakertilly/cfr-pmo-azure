import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listProjectIssues,
  createProjectIssue,
  updateProjectIssue,
  deleteProjectIssue,
  type ProjectIssueCreate,
  type ProjectIssuePayload,
} from '../api/projectIssues.api';
import type { ProjectIssue } from '../models/projectIssue.model';
import { toast } from './useToast';

const KEYS = {
  forProject: (projectId: string) => ['projectIssues', projectId] as const,
};

export function useProjectIssues(projectId: string | undefined) {
  return useQuery({
    queryKey: KEYS.forProject(projectId ?? ''),
    queryFn: () => listProjectIssues(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateProjectIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectIssueCreate) => createProjectIssue(payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: KEYS.forProject(projectId) });
      const previous = qc.getQueryData<ProjectIssue[]>(KEYS.forProject(projectId));
      const optimistic = {
        msdyn_projectissueid: `optimistic-${Date.now()}`,
        msdyn_name: payload.msdyn_name,
        msdyn_description: payload.msdyn_description,
        statecode: 0,
        createdon: new Date().toISOString(),
        _msdyn_project_value: projectId,
        _saving: true,
      } as unknown as ProjectIssue;
      qc.setQueryData<ProjectIssue[]>(KEYS.forProject(projectId), (old) => [optimistic, ...(old ?? [])]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData<ProjectIssue[]>(KEYS.forProject(projectId), ctx.previous);
      toast.error('Failed to save issue. Please try again.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.forProject(projectId) }),
  });
}

export function useUpdateProjectIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProjectIssuePayload }) =>
      updateProjectIssue(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.forProject(projectId) }),
    onError: () => toast.error('Failed to update issue. Please try again.'),
  });
}

export function useDeleteProjectIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProjectIssue(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.forProject(projectId) }),
    onError: () => toast.error('Failed to delete issue. Please try again.'),
  });
}
