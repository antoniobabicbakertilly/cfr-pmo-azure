import { useQuery } from '@tanstack/react-query';
import { listTasksForProjects } from '../api/programTasks.api';

export function useProgramTasks(programId: string | undefined, projectIds: string[]) {
  return useQuery({
    queryKey: ['programTasks', programId, projectIds.join(',')],
    queryFn: () => listTasksForProjects(projectIds),
    enabled: !!programId && projectIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}
