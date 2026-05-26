import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listStatusReports,
  getStatusReport,
  createStatusReport,
  updateStatusReport,
  deleteStatusReport,
  type StatusReportCreate,
  type StatusReportPayload,
} from '../api/statusReports.api';

const KEYS = {
  all: ['statusReports'] as const,
  forProject: (projectId: string) => ['statusReports', 'project', projectId] as const,
  detail: (id: string) => ['statusReports', 'detail', id] as const,
};

export function useStatusReports(projectId?: string) {
  return useQuery({
    queryKey: projectId ? KEYS.forProject(projectId) : KEYS.all,
    queryFn: () => listStatusReports(projectId),
  });
}

export function useStatusReport(id: string | undefined) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ''),
    queryFn: () => getStatusReport(id!),
    enabled: !!id,
  });
}

export function useCreateStatusReport(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: StatusReportCreate) => createStatusReport(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.forProject(projectId) }),
  });
}

export function useUpdateStatusReport(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StatusReportPayload }) =>
      updateStatusReport(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.forProject(projectId) }),
  });
}

export function useDeleteStatusReport(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteStatusReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.forProject(projectId) }),
  });
}
