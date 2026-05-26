import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createProjectBucket,
  renameProjectBucket,
  deleteProjectBucket,
} from '../api/projectBuckets.api';
import { PSS_DELAY } from './useProjectTaskMutations';
import type { ProjectBucket } from '../models/projectBucket.model';

export const BUCKET_KEYS = {
  forProject: (projectId: string) => ['projectBuckets', projectId] as const,
};

export function useCreateProjectBucket(projectId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ name, displayOrder }: { name: string; displayOrder?: number }) =>
      createProjectBucket(projectId, name, displayOrder),

    onMutate: async ({ name }) => {
      await qc.cancelQueries({ queryKey: BUCKET_KEYS.forProject(projectId) });

      const optimistic: ProjectBucket = {
        msdyn_projectbucketid: `optimistic-${Date.now()}`,
        msdyn_name: name,
        statecode: 0,
        '_msdyn_project_value': projectId,
      };

      qc.setQueryData<ProjectBucket[]>(BUCKET_KEYS.forProject(projectId), (old) =>
        old ? [...old, optimistic] : [optimistic],
      );
    },

    // Do NOT roll back the optimistic record on error. The PSS executeOperationSet
    // call often throws (timeout / transient gateway error) AFTER PSS has already
    // queued and applied the create server-side — rolling back makes the user's
    // freshly-created bucket vanish for ~20s, then reappear when some other refetch
    // fires. They click again, and now there are two "Bucket 1"s. Instead, leave
    // the optimistic in place. The post-PSS_DELAY invalidate in onSettled refetches
    // the real list — if PSS did persist, the real bucket replaces the optimistic;
    // if it truly didn't, the optimistic is dropped.
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.warn(
        '[useCreateProjectBucket] mutation error (keeping optimistic, will reconcile on refetch):',
        err,
      );
    },

    onSettled: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.BUCKET));
      qc.invalidateQueries({ queryKey: BUCKET_KEYS.forProject(projectId) });
    },
  });
}

export function useRenameProjectBucket(projectId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ bucketId, name }: { bucketId: string; name: string }) =>
      renameProjectBucket(projectId, bucketId, name),

    onMutate: async ({ bucketId, name }) => {
      await qc.cancelQueries({ queryKey: BUCKET_KEYS.forProject(projectId) });
      const prev = qc.getQueryData<ProjectBucket[]>(BUCKET_KEYS.forProject(projectId));

      qc.setQueryData<ProjectBucket[]>(BUCKET_KEYS.forProject(projectId), (old) =>
        old?.map((b) =>
          b.msdyn_projectbucketid === bucketId ? { ...b, msdyn_name: name } : b,
        ),
      );

      return { prev };
    },

    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        qc.setQueryData(BUCKET_KEYS.forProject(projectId), context.prev);
      }
    },

    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.BUCKET));
      qc.invalidateQueries({ queryKey: BUCKET_KEYS.forProject(projectId) });
    },
  });
}

export function useDeleteProjectBucket(projectId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (bucketId: string) => deleteProjectBucket(projectId, bucketId),

    onMutate: async (bucketId) => {
      await qc.cancelQueries({ queryKey: BUCKET_KEYS.forProject(projectId) });
      const prev = qc.getQueryData<ProjectBucket[]>(BUCKET_KEYS.forProject(projectId));

      qc.setQueryData<ProjectBucket[]>(BUCKET_KEYS.forProject(projectId), (old) =>
        old?.filter((b) => b.msdyn_projectbucketid !== bucketId),
      );

      return { prev };
    },

    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        qc.setQueryData(BUCKET_KEYS.forProject(projectId), context.prev);
      }
    },

    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, PSS_DELAY.BUCKET));
      qc.invalidateQueries({ queryKey: BUCKET_KEYS.forProject(projectId) });
    },
  });
}
