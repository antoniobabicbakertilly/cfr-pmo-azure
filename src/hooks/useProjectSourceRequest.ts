import { useQuery } from '@tanstack/react-query';
import { listProjectRequests } from '../api/projectRequests.api';
import type { ProjectRequest } from '../models/projectRequest.model';

export function useProjectSourceRequest(projectId: string | undefined) {
  return useQuery<ProjectRequest | null>({
    queryKey: ['projectSourceRequest', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const results = await listProjectRequests({
        $filter: `_pmo_convertedproject_value eq '${projectId}' and statecode eq 0`,
      });
      return results.length > 0 ? results[0] : null;
    },
    enabled: !!projectId,
    staleTime: 10 * 60 * 1000,
  });
}
