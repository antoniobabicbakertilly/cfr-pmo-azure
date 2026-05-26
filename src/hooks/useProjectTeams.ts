import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listProjectTeams, createProjectTeam, removeProjectTeam } from '../api/projectTeams.api';
import type { ProjectTeamCreate } from '../models/projectTeam.model';
import { useCanEditProjectRoster, assertCanEditProject } from './useProjectPermissions';

const KEYS = {
  forProject: (projectId: string) => ['projectTeams', projectId] as const,
};

export function useProjectTeams(projectId: string | undefined) {
  return useQuery({
    queryKey: KEYS.forProject(projectId ?? ''),
    queryFn: () => listProjectTeams(projectId!),
    enabled: !!projectId,
  });
}

export function useAddProjectTeam(projectId: string) {
  const qc = useQueryClient();
  const permission = useCanEditProjectRoster(projectId);
  return useMutation({
    mutationFn: (payload: ProjectTeamCreate) => {
      assertCanEditProject(permission, 'add a team to this project');
      return createProjectTeam(payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.forProject(projectId) }),
  });
}

export function useRemoveProjectTeam(projectId: string) {
  const qc = useQueryClient();
  const permission = useCanEditProjectRoster(projectId);
  return useMutation({
    mutationFn: (teamRecordId: string) => {
      assertCanEditProject(permission, 'remove a team from this project');
      return removeProjectTeam(teamRecordId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.forProject(projectId) }),
  });
}
