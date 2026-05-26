import { useQuery } from '@tanstack/react-query';
import { listProjectBuckets } from '../api/projectBuckets.api';

const KEYS = {
  forProject: (projectId: string) => ['projectBuckets', projectId] as const,
};

export function useProjectBuckets(projectId: string | undefined) {
  return useQuery({
    queryKey: KEYS.forProject(projectId ?? ''),
    queryFn: () => listProjectBuckets(projectId!),
    enabled: !!projectId,
  });
}
