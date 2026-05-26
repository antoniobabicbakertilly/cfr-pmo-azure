import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listProjectMeetingLinks, createProjectMeetingLink, updateProjectMeetingLink, deactivateProjectMeetingLink } from '../api/projectMeetingLinks.api';
import type { ProjectMeetingLinkCreate, ProjectMeetingLinkUpdate } from '../models/projectMeetingLink.model';

const QK = (projectId: string) => ['projectMeetingLinks', projectId] as const;

export function useProjectMeetingLinks(projectId: string | undefined) {
  return useQuery({
    queryKey: QK(projectId ?? ''),
    queryFn: () => listProjectMeetingLinks(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProjectMeetingLink(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectMeetingLinkCreate) => createProjectMeetingLink(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
  });
}

export function useUpdateProjectMeetingLink(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProjectMeetingLinkUpdate }) =>
      updateProjectMeetingLink(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
  });
}

export function useDeactivateProjectMeetingLink(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateProjectMeetingLink(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
  });
}
