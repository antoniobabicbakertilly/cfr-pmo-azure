import { useQuery } from '@tanstack/react-query';
import { listProjectTaskDependencies } from '../api/projectTaskDependencies.api';

export const DEPENDENCY_KEYS = {
  forProject: (projectId: string) => ['projectTaskDependencies', projectId] as const,
};

export function useProjectTaskDependencies(projectId: string | undefined) {
  return useQuery({
    queryKey: DEPENDENCY_KEYS.forProject(projectId ?? ''),
    queryFn: () => listProjectTaskDependencies(projectId!),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  });
}
