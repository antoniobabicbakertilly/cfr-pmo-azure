import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createProjectTeamMember, deleteProjectTeamMember } from '../lib/schedulingClient';

const TEAM_MEMBER_KEY = (projectId: string) => ['projectTeamMembers', projectId];

export function useAddProjectTeamMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookableResourceId: string) =>
      createProjectTeamMember(projectId, bookableResourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_MEMBER_KEY(projectId) });
    },
  });
}

export function useRemoveProjectTeamMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teamMemberId: string) =>
      deleteProjectTeamMember(projectId, teamMemberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_MEMBER_KEY(projectId) });
    },
  });
}
