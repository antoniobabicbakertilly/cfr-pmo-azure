import { useQuery } from '@tanstack/react-query';
import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';

interface LightTask {
  msdyn_projecttaskid: string;
  '_msdyn_project_value': string | null;
  msdyn_summary: boolean | null;
  msdyn_outlinelevel: number | null;
  msdyn_scheduledstart: string | null;
  msdyn_scheduledend: string | null;
  msdyn_finish: string | null;
  msdyn_progress: number | null;
  statecode: number;
}

async function fetchAllTasks(): Promise<LightTask[]> {
  return dv.list<LightTask>(ENTITY_SETS.projectTask, {
    $select: [
      'msdyn_projecttaskid',
      '_msdyn_project_value',
      'msdyn_summary',
      'msdyn_outlinelevel',
      'msdyn_scheduledstart',
      'msdyn_scheduledend',
      'msdyn_finish',
      'msdyn_progress',
      'statecode',
    ],
    $filter: 'statecode eq 0 and msdyn_outlinelevel gt 0 and msdyn_summary eq false',
    $top: 5000,
  });
}

export function useAllProjectTasks() {
  return useQuery({
    queryKey: ['allProjectTasks'],
    queryFn: fetchAllTasks,
    staleTime: 5 * 60 * 1000,
  });
}
