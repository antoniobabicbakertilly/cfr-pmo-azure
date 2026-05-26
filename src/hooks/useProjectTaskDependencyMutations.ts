import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createProjectTaskDependency, deleteProjectTaskDependency, LINK_TYPE } from '../lib/schedulingClient';
import { DEPENDENCY_KEYS } from './useProjectTaskDependencies';
import { PSS_DELAY } from './useProjectTaskMutations';

export function useCreateProjectTaskDependency(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      successorTaskId,
      predecessorTaskId,
      linkType = LINK_TYPE.FS,
    }: {
      successorTaskId: string;
      predecessorTaskId: string;
      linkType?: number;
    }) => createProjectTaskDependency(projectId, successorTaskId, predecessorTaskId, linkType),
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.DEPENDENCY));
      qc.invalidateQueries({ queryKey: DEPENDENCY_KEYS.forProject(projectId) });
    },
  });
}

export function useDeleteProjectTaskDependency(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dependencyId: string) =>
      deleteProjectTaskDependency(projectId, dependencyId),
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.DEPENDENCY));
      qc.invalidateQueries({ queryKey: DEPENDENCY_KEYS.forProject(projectId) });
    },
  });
}
