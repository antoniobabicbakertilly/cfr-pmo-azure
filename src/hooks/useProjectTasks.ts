import { useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listProjectTasks } from '../api/projectTasks.api';
import { applyTaskDateOverrides, subscribeToOverrides, getOverrideVersion } from '../lib/taskDateOverrides';

const KEYS = {
  forProject: (projectId: string) => ['projectTasks', projectId] as const,
};

export function useProjectTasks(projectId: string | undefined) {
  const query = useQuery({
    queryKey: KEYS.forProject(projectId ?? ''),
    queryFn: () => listProjectTasks(projectId!),
    enabled: !!projectId,
  });

  // Re-run whenever the override store changes so date edits survive cache invalidations.
  const overrideVersion = useSyncExternalStore(subscribeToOverrides, getOverrideVersion);

  return {
    ...query,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    data: useMemo(() => (query.data ? applyTaskDateOverrides(query.data) : query.data), [query.data, overrideVersion]),
  };
}
