import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createResourceAssignment, deleteResourceAssignment } from '../lib/schedulingClient';
import { RESOURCE_ASSIGNMENT_KEY } from './useResourceAssignments';
import { PSS_DELAY } from './useProjectTaskMutations';

export function useAssignResource(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, teamMemberId, name }: { taskId: string; teamMemberId: string; name: string }) =>
      createResourceAssignment(projectId, taskId, teamMemberId, name),
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.ASSIGNMENT));
      queryClient.invalidateQueries({ queryKey: RESOURCE_ASSIGNMENT_KEY(projectId) });
    },
  });
}

export function useUnassignResource(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => deleteResourceAssignment(projectId, assignmentId),
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.ASSIGNMENT));
      queryClient.invalidateQueries({ queryKey: RESOURCE_ASSIGNMENT_KEY(projectId) });
    },
  });
}
