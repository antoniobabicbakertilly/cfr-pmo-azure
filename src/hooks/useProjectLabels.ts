import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listLabelsForProject, listTaskLabels } from '../api/projectLabels.api';
import { assignLabelToTask, removeLabelFromTask, renameLabel } from '../lib/schedulingClient';
import type { ProjectLabel, ProjectTaskToLabel } from '../models/projectLabel.model';
import { PSS_DELAY } from './useProjectTaskMutations';

const LABEL_KEYS = {
  forProject: (pid: string) => ['projectLabels', pid] as const,
  taskLabels: (pid: string) => ['projectTaskLabels', pid] as const,
};

export function useProjectLabels(projectId: string | null) {
  return useQuery({
    queryKey: LABEL_KEYS.forProject(projectId ?? ''),
    queryFn: () => listLabelsForProject(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });
}

export function useProjectTaskLabels(projectId: string | null) {
  return useQuery({
    queryKey: LABEL_KEYS.taskLabels(projectId ?? ''),
    queryFn: () => listTaskLabels(projectId!),
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useRenameLabel(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { labelId: string; name: string }) =>
      renameLabel(projectId, params.labelId, params.name),
    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey: LABEL_KEYS.forProject(projectId) });
      const prev = qc.getQueryData<ProjectLabel[]>(LABEL_KEYS.forProject(projectId));
      qc.setQueryData<ProjectLabel[]>(LABEL_KEYS.forProject(projectId), (old) =>
        old?.map((l) =>
          l.msdyn_projectlabelid === params.labelId
            ? { ...l, msdyn_projectlabeltext: params.name }
            : l,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(LABEL_KEYS.forProject(projectId), ctx.prev);
    },
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.METADATA));
      qc.invalidateQueries({ queryKey: LABEL_KEYS.forProject(projectId) });
    },
  });
}

export function useAssignLabel(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { taskId: string; labelId: string }) =>
      assignLabelToTask(projectId, params.taskId, params.labelId),
    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey: LABEL_KEYS.taskLabels(projectId) });
      const prev = qc.getQueryData<ProjectTaskToLabel[]>(LABEL_KEYS.taskLabels(projectId));
      const optimistic: ProjectTaskToLabel = {
        msdyn_projecttasktolabelid: `optimistic-${Date.now()}`,
        '_msdyn_projectlabelid_value': params.labelId,
        '_msdyn_projecttaskid_value': params.taskId,
        statecode: 0,
      };
      qc.setQueryData<ProjectTaskToLabel[]>(LABEL_KEYS.taskLabels(projectId), (old) =>
        old ? [...old, optimistic] : [optimistic],
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(LABEL_KEYS.taskLabels(projectId), ctx.prev);
    },
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.METADATA));
      qc.invalidateQueries({ queryKey: LABEL_KEYS.taskLabels(projectId) });
    },
  });
}

export function useRemoveLabel(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskToLabelId: string) => removeLabelFromTask(projectId, taskToLabelId),
    onMutate: async (taskToLabelId) => {
      await qc.cancelQueries({ queryKey: LABEL_KEYS.taskLabels(projectId) });
      const prev = qc.getQueryData<ProjectTaskToLabel[]>(LABEL_KEYS.taskLabels(projectId));
      qc.setQueryData<ProjectTaskToLabel[]>(LABEL_KEYS.taskLabels(projectId), (old) =>
        old?.filter((tl) => tl.msdyn_projecttasktolabelid !== taskToLabelId),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(LABEL_KEYS.taskLabels(projectId), ctx.prev);
    },
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.METADATA));
      qc.invalidateQueries({ queryKey: LABEL_KEYS.taskLabels(projectId) });
    },
  });
}
