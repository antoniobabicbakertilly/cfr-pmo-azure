/**
 * Project task mutation hooks.
 *
 * Scheduling actions (CreateOperationSetV1 → PssCreateV1/UpdateV1/DeleteV1 → ExecuteOperationSetV1)
 * are asynchronous — Dataverse lags behind the scheduling service after ExecuteOperationSet returns.
 * The async save pattern here:
 *   1. Optimistic cache update (immediate, user sees the change)
 *   2. Call scheduling action (flight)
 *   3. Wait SCHEDULING_PERSIST_DELAY_MS (calibrated in Phase 0 spike)
 *   4. Invalidate query → re-fetch true server state
 *   5. On error: rollback optimistic state, surface error for toast
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  type ScheduleTaskCreate,
  type ScheduleTaskUpdate,
} from '../lib/schedulingClient';
import { enqueueTaskUpdate } from '../lib/taskMutationQueue';
import type { ProjectTask } from '../models/projectTask.model';
import { useCanEditProject, assertCanEditProject } from './useProjectPermissions';

/**
 * Tiered persistence delays based on official Microsoft API performance benchmarks.
 * Source: https://learn.microsoft.com/en-us/dynamics365/project-operations/project-management/project-schedule-api-performance
 *
 * "Total Duration" = Schedule API duration + Project Save Service time + time to sync to Dataverse.
 * Values below are P90 total durations + a small buffer rounded up.
 *
 * | Operation        | P90 (required) | P90 (all fields) | Our delay |
 * |------------------|----------------|------------------|-----------|
 * | Create Task      | 7.86s          | 12.63s           | 14s       |
 * | Update Task      | 7.79s          | 18.72s           | 20s       |
 * | Delete Task      | 7.92s          | 9.68s            | 11s       |
 * | Create Assign    | 10.86s         | 12.81s           | 14s       |
 * | Create Dep       | 9.07s          | 10.35s           | 11s       |
 * | Checklist/Label   | not benchmarked (simpler entities) | 8s  |
 */
export const PSS_DELAY = {
  TASK_CREATE:      14_000, // P90 12.63s + buffer
  TASK_UPDATE:      20_000, // P90 18.72s (worst case: update with all fields)
  TASK_DELETE:      11_000, // P90 9.68s + buffer
  ASSIGNMENT:       14_000, // P90 12.81s + buffer
  DEPENDENCY:       11_000, // P90 10.35s + buffer
  BUCKET:           11_000, // similar to dependency (simple entity)
  METADATA:          8_000, // checklists, labels, sprints — simpler entities, not in benchmarks
  TEMPLATE:         50_000, // bulk create (P90 for 100 tasks: 47.55s)
} as const;

/** @deprecated Use PSS_DELAY tier constants instead. Kept for backward compat. */
export const SCHEDULING_PERSIST_DELAY_MS = PSS_DELAY.TASK_UPDATE;

const TASK_KEYS = {
  forProject: (projectId: string) => ['projectTasks', projectId] as const,
};

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateProjectTask(projectId: string) {
  const qc = useQueryClient();
  const permission = useCanEditProject(projectId);

  return useMutation({
    mutationFn: (params: ScheduleTaskCreate) => {
      assertCanEditProject(permission, 'create a task on this project');
      return createProjectTask(params);
    },

    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey: TASK_KEYS.forProject(projectId) });

      const optimisticTask: ProjectTask = {
        msdyn_projecttaskid: `optimistic-${Date.now()}`,
        msdyn_subject: params.subject,
        msdyn_scheduledstart: params.scheduledStart,
        msdyn_scheduledend: params.scheduledEnd,
        msdyn_duration: params.duration,
        msdyn_ismilestone: params.isMilestone,
        msdyn_progress: 0,
        msdyn_outlinelevel: 1,
        statecode: 0,
        '_msdyn_project_value': params.projectId,
        '_msdyn_projectbucket_value': params.bucketId,
        '_msdyn_parenttask_value': params.parentTaskId,
        _saving: true,
      };

      qc.setQueryData<ProjectTask[]>(TASK_KEYS.forProject(projectId), (old) =>
        old ? [...old, optimisticTask] : [optimisticTask],
      );
    },

    // Do NOT roll back the optimistic record on error. The PSS executeOperationSet
    // call frequently throws (timeout / transient gateway error) AFTER PSS has
    // already queued and applied the create server-side -- rolling back makes the
    // user's freshly-created task vanish for ~20s, then reappear when some other
    // refetch fires. They click again, and now there are two of the same task.
    // Instead, leave the optimistic in place. The post-PSS_DELAY invalidate in
    // onSettled refetches the real list -- if PSS did persist, the real task
    // replaces the optimistic; if it truly did not, the optimistic is dropped.
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.warn('[useCreateProjectTask] mutation error (keeping optimistic, will reconcile on refetch):', err);
    },

    // Clear the optimistic _saving flag the moment the create promise settles
    // and schedule a single post-PSS_DELAY refetch to reconcile cache with
    // server. onSettled runs after both onSuccess and onError so the optimistic
    // is always reconciled -- not stuck "saving" or duplicated.
    onSettled: async () => {
      qc.setQueryData<ProjectTask[]>(TASK_KEYS.forProject(projectId), (old) =>
        old?.map((t) => (t._saving ? { ...t, _saving: false } : t)),
      );
      await new Promise((r) => setTimeout(r, PSS_DELAY.TASK_CREATE));
      qc.invalidateQueries({ queryKey: TASK_KEYS.forProject(projectId) });
    },
  });
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateProjectTask(projectId: string) {
  const qc = useQueryClient();
  const permission = useCanEditProject(projectId);

  return useMutation({
    // Stage 3: route through per-task queue so concurrent edits to the same
    // task are coalesced into a single in-flight PSS OperationSet rather than
    // spawning parallel ones that race + burn the user's 10-opSet quota.
    mutationFn: (params: ScheduleTaskUpdate) => {
      assertCanEditProject(permission, 'update this task');
      return enqueueTaskUpdate(params, (merged) => updateProjectTask(merged, projectId));
    },

    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey: TASK_KEYS.forProject(projectId) });
      const prev = qc.getQueryData<ProjectTask[]>(TASK_KEYS.forProject(projectId));

      qc.setQueryData<ProjectTask[]>(TASK_KEYS.forProject(projectId), (old) =>
        old?.map((t) => {
          if (t.msdyn_projecttaskid !== params.taskId) return t;
          // Stage 7: when the user changes Hours done (effortCompleted), the
          // card's % bar reads msdyn_progress directly. PSS recomputes it
          // server-side but that's ~20s out. Compute it optimistically here
          // so the card refreshes the same instant the panel preview does.
          const nextEffortCompleted = params.effortCompleted !== undefined
            ? params.effortCompleted
            : t.msdyn_effortcompleted;
          const nextEffort = params.effort !== undefined ? params.effort : t.msdyn_effort;
          const optimisticProgress =
            nextEffort !== undefined && nextEffort > 0 && nextEffortCompleted !== undefined
              ? Math.min(1, nextEffortCompleted / nextEffort)
              : t.msdyn_progress;
          return {
                ...t,
                ...(params.subject !== undefined ? { msdyn_subject: params.subject } : {}),
                ...(params.progress !== undefined ? { msdyn_progress: params.progress } : {}),
                ...(params.effortCompleted !== undefined ? { msdyn_effortcompleted: params.effortCompleted, msdyn_progress: optimisticProgress } : {}),
                ...(params.effort !== undefined ? { msdyn_effort: params.effort, msdyn_progress: optimisticProgress } : {}),
                ...(params.scheduledStart !== undefined ? { msdyn_scheduledstart: params.scheduledStart } : {}),
                ...(params.scheduledEnd !== undefined ? { msdyn_scheduledend: params.scheduledEnd } : {}),
                ...(params.duration !== undefined ? { msdyn_duration: params.duration } : {}),
                ...(params.isMilestone !== undefined ? { msdyn_ismilestone: params.isMilestone } : {}),
                ...(params.priority !== undefined ? { msdyn_priority: params.priority } : {}),
                ...(params.description !== undefined ? { msdyn_description: params.description } : {}),
                ...(params.bucketId !== undefined ? { '_msdyn_projectbucket_value': params.bucketId } : {}),
                _saving: true,
              };
        }),
      );

      return { prev };
    },

    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        qc.setQueryData(TASK_KEYS.forProject(projectId), context.prev);
      }
    },

    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.TASK_UPDATE));
      qc.invalidateQueries({ queryKey: TASK_KEYS.forProject(projectId) });
    },

    // Clear _saving the moment the update promise settles, so a slow or
    // dropped post-PSS invalidate can't leave the card permanently locked.
    onSettled: () => {
      qc.setQueryData<ProjectTask[]>(TASK_KEYS.forProject(projectId), (old) =>
        old?.map((t) => (t._saving ? { ...t, _saving: false } : t)),
      );
    },
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteProjectTask(projectId: string) {
  const qc = useQueryClient();
  const permission = useCanEditProject(projectId);

  return useMutation({
    mutationFn: (taskId: string) => {
      assertCanEditProject(permission, 'delete this task');
      return deleteProjectTask(taskId, projectId);
    },

    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: TASK_KEYS.forProject(projectId) });
      const prev = qc.getQueryData<ProjectTask[]>(TASK_KEYS.forProject(projectId));

      qc.setQueryData<ProjectTask[]>(TASK_KEYS.forProject(projectId), (old) =>
        old?.filter((t) => t.msdyn_projecttaskid !== taskId),
      );

      return { prev };
    },

    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        qc.setQueryData(TASK_KEYS.forProject(projectId), context.prev);
      }
    },

    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.TASK_DELETE));
      qc.invalidateQueries({ queryKey: TASK_KEYS.forProject(projectId) });
    },
  });
}
