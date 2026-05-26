import { useQuery } from '@tanstack/react-query';
import { listResourceAssignments } from '../api/resourceAssignments.api';

export const RESOURCE_ASSIGNMENT_KEY = (projectId: string) =>
  ['resourceAssignments', projectId] as const;

export function useResourceAssignments(projectId: string | undefined) {
  return useQuery({
    queryKey: RESOURCE_ASSIGNMENT_KEY(projectId ?? ''),
    queryFn: () => listResourceAssignments(projectId!),
    enabled: !!projectId,
    staleTime: 0,
  });
}
