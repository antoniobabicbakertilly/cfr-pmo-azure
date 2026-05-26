import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listSprintsForProject } from '../api/projectSprints.api';
import { setTaskSprint } from '../lib/schedulingClient';
import type { ProjectTask } from '../models/projectTask.model';
import { PSS_DELAY } from './useProjectTaskMutations';

const SPRINT_KEYS = {
  forProject: (pid: string) => ['projectSprints', pid] as const,
};
const TASK_KEYS = {
  forProject: (pid: string) => ['projectTasks', pid] as const,
};

export function useProjectSprints(projectId: string | null) {
  return useQuery({
    queryKey: SPRINT_KEYS.forProject(projectId ?? ''),
    queryFn: () => listSprintsForProject(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });
}

export function useSetTaskSprint(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { taskId: string; sprintId: string | null }) =>
      setTaskSprint(params.taskId, projectId, params.sprintId),
    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey: TASK_KEYS.forProject(projectId) });
      const prev = qc.getQueryData<ProjectTask[]>(TASK_KEYS.forProject(projectId));
      qc.setQueryData<ProjectTask[]>(TASK_KEYS.forProject(projectId), (old) =>
        old?.map((t) =>
          t.msdyn_projecttaskid === params.taskId
            ? { ...t, '_msdyn_projectsprint_value': params.sprintId ?? undefined, _saving: true }
            : t,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(TASK_KEYS.forProject(projectId), ctx.prev);
    },
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.TASK_UPDATE));
      qc.invalidateQueries({ queryKey: TASK_KEYS.forProject(projectId) });
    },
  });
}
