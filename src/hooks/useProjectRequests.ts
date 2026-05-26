import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listProjectRequests,
  getProjectRequest,
  createProjectRequest,
  updateProjectRequest,
  submitRequest,
  approveRequest,
  rejectRequest,
  moveToTriage,
  routeOperational,
  redirectRequest,
  requestClarification,
  resolveClarification,
  markAsDuplicate,
  linkParentRequest,
} from '../api/projectRequests.api';
import type { ProjectRequestCreate, ProjectRequestUpdate } from '../models/projectRequest.model';

const KEYS = {
  all: ['projectRequests'] as const,
  list: (filter?: string) => [...KEYS.all, 'list', filter] as const,
  detail: (id: string) => [...KEYS.all, 'detail', id] as const,
};

export function useProjectRequests(filter?: string) {
  return useQuery({
    queryKey: KEYS.list(filter),
    queryFn: () => listProjectRequests(filter ? { $filter: filter } : undefined),
    // Refetch on every mount so the queue reflects deletions made elsewhere
    // in the app (project/program cascade hard-deletes the originating
    // request) without forcing a hard browser refresh.
    refetchOnMount: 'always',
  });
}

export function useProjectRequest(id: string | undefined) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ''),
    queryFn: () => getProjectRequest(id!),
    enabled: !!id,
  });
}

export function useCreateProjectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectRequestCreate) => createProjectRequest(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateProjectRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectRequestUpdate) => updateProjectRequest(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useSubmitRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => submitRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useApproveRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => approveRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useRejectRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => rejectRequest(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useMoveToTriage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => moveToTriage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useRouteOperational(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teamId?: string) => routeOperational(id, teamId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useRedirectRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (triageComments: string) => redirectRequest(id, triageComments),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useRequestClarification(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (question: string) => requestClarification(id, question),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useResolveClarification(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (response: string) => resolveClarification(id, response),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useMarkAsDuplicate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ originalId, autoNumber }: { originalId: string; autoNumber: string }) =>
      markAsDuplicate(id, originalId, autoNumber),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useLinkParentRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (parentId: string) => linkParentRequest(id, parentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}
