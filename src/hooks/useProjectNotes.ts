/**
 * React Query hooks for the project / task notes feature.
 *
 * Mirrors useProjectChecklists / useProjectLabels in shape: one read hook
 * per scope, three mutation hooks (create / update / delete) keyed by the
 * parent entity. After every successful mutation we invalidate both the
 * direct scope query AND the project rollup query so a task-note write
 * shows up immediately on the project's Notes tab too.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listProjectNotes,
  listTaskNotes,
  listNotesForTasks,
  createNote,
  updateNote,
  deleteNote,
  type ProjectNote,
  type NoteCreateInput,
  type NoteUpdateInput,
} from '../api/projectNotes.api';

const KEYS = {
  project:        (projectId: string) => ['notes', 'project', projectId] as const,
  task:           (taskId: string) => ['notes', 'task', taskId] as const,
  projectRollup:  (projectId: string) => ['notes', 'projectRollup', projectId] as const,
};

export function useProjectNotes(projectId: string | undefined) {
  return useQuery<ProjectNote[]>({
    queryKey: KEYS.project(projectId ?? ''),
    queryFn: () => listProjectNotes(projectId!),
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

export function useTaskNotes(taskId: string | undefined) {
  return useQuery<ProjectNote[]>({
    queryKey: KEYS.task(taskId ?? ''),
    queryFn: () => listTaskNotes(taskId!),
    enabled: !!taskId,
    staleTime: 30 * 1000,
  });
}

/**
 * Roll-up reader for the project Notes tab — every note attached to any
 * task in the supplied id list. Hook returns an empty list when no task
 * ids are provided, so callers can pass [] freely while tasks are still
 * loading.
 */
export function useTaskNotesRollup(projectId: string | undefined, taskIds: string[]) {
  // Stable cache key that reflects the actual id set.
  const sortedKey = taskIds.slice().sort().join(',');
  return useQuery<ProjectNote[]>({
    queryKey: [...KEYS.projectRollup(projectId ?? ''), sortedKey],
    queryFn: () => listNotesForTasks(taskIds),
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

export function useCreateNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NoteCreateInput) => createNote(input),
    onSuccess: (_data, input) => {
      // Invalidate the direct scope query.
      if (input.parentEntitySet === 'msdyn_projects') {
        qc.invalidateQueries({ queryKey: KEYS.project(input.parentId) });
      } else {
        qc.invalidateQueries({ queryKey: KEYS.task(input.parentId) });
      }
      // Always re-fetch the project rollup so task notes appear on the
      // project's Notes tab without a manual refresh.
      qc.invalidateQueries({ queryKey: KEYS.projectRollup(projectId) });
    },
  });
}

export function useUpdateNote(projectId: string, scope: { kind: 'project' | 'task'; parentId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NoteUpdateInput) => updateNote(input),
    onSuccess: () => {
      if (scope.kind === 'project') {
        qc.invalidateQueries({ queryKey: KEYS.project(scope.parentId) });
      } else {
        qc.invalidateQueries({ queryKey: KEYS.task(scope.parentId) });
      }
      qc.invalidateQueries({ queryKey: KEYS.projectRollup(projectId) });
    },
  });
}

export function useDeleteNote(projectId: string, scope: { kind: 'project' | 'task'; parentId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => deleteNote(noteId),
    onSuccess: () => {
      if (scope.kind === 'project') {
        qc.invalidateQueries({ queryKey: KEYS.project(scope.parentId) });
      } else {
        qc.invalidateQueries({ queryKey: KEYS.task(scope.parentId) });
      }
      qc.invalidateQueries({ queryKey: KEYS.projectRollup(projectId) });
    },
  });
}
