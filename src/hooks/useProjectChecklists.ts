import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listChecklistsForTask } from '../api/projectChecklists.api';
import {
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  type ScheduleChecklistCreate,
  type ScheduleChecklistUpdate,
} from '../lib/schedulingClient';
import type { ProjectChecklist } from '../models/projectChecklist.model';
import { PSS_DELAY } from './useProjectTaskMutations';

const CHECKLIST_KEYS = {
  forTask: (taskId: string) => ['projectChecklists', taskId] as const,
};

export function useProjectChecklists(taskId: string | null) {
  return useQuery({
    queryKey: CHECKLIST_KEYS.forTask(taskId ?? ''),
    queryFn: () => listChecklistsForTask(taskId!),
    enabled: !!taskId,
    staleTime: 30_000,
  });
}

export function useCreateChecklistItem(taskId: string, _projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: ScheduleChecklistCreate) => createChecklistItem(params),
    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey: CHECKLIST_KEYS.forTask(taskId) });
      const prev = qc.getQueryData<ProjectChecklist[]>(CHECKLIST_KEYS.forTask(taskId));
      const optimistic: ProjectChecklist = {
        msdyn_projectchecklistid: `optimistic-${Date.now()}`,
        msdyn_name: params.name,
        msdyn_projectchecklistcompleted: false,
        msdyn_projectchecklistorder: params.order ?? 999,
        '_msdyn_projecttaskid_value': taskId,
        statecode: 0,
      };
      qc.setQueryData<ProjectChecklist[]>(CHECKLIST_KEYS.forTask(taskId), (old) =>
        old ? [...old, optimistic] : [optimistic],
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(CHECKLIST_KEYS.forTask(taskId), ctx.prev);
    },
    onSuccess: async () => {
      // Wait for full PSS persistence before re-fetching. Do NOT re-fetch early —
      // an early re-fetch returns stale data and wipes the optimistic item.
      await new Promise((r) => setTimeout(r, PSS_DELAY.METADATA));
      qc.invalidateQueries({ queryKey: CHECKLIST_KEYS.forTask(taskId) });
    },
  });
}

export function useUpdateChecklistItem(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: ScheduleChecklistUpdate) => updateChecklistItem(params),
    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey: CHECKLIST_KEYS.forTask(taskId) });
      const prev = qc.getQueryData<ProjectChecklist[]>(CHECKLIST_KEYS.forTask(taskId));
      qc.setQueryData<ProjectChecklist[]>(CHECKLIST_KEYS.forTask(taskId), (old) =>
        old?.map((item) =>
          item.msdyn_projectchecklistid === params.checklistId
            ? {
                ...item,
                ...(params.name !== undefined ? { msdyn_name: params.name } : {}),
                ...(params.completed !== undefined ? { msdyn_projectchecklistcompleted: params.completed } : {}),
              }
            : item,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(CHECKLIST_KEYS.forTask(taskId), ctx.prev);
    },
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.METADATA));
      qc.invalidateQueries({ queryKey: CHECKLIST_KEYS.forTask(taskId) });
    },
  });
}

export function useDeleteChecklistItem(taskId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checklistId: string) => deleteChecklistItem(projectId, checklistId),
    onMutate: async (checklistId) => {
      await qc.cancelQueries({ queryKey: CHECKLIST_KEYS.forTask(taskId) });
      const prev = qc.getQueryData<ProjectChecklist[]>(CHECKLIST_KEYS.forTask(taskId));
      qc.setQueryData<ProjectChecklist[]>(CHECKLIST_KEYS.forTask(taskId), (old) =>
        old?.filter((item) => item.msdyn_projectchecklistid !== checklistId),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(CHECKLIST_KEYS.forTask(taskId), ctx.prev);
    },
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.METADATA));
      qc.invalidateQueries({ queryKey: CHECKLIST_KEYS.forTask(taskId) });
    },
  });
}
