import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listProjectDocuments, listProgramDocuments,
  createDocumentLink, updateDocumentLink, deactivateDocumentLink,
} from '../api/documentLinks.api';
import type { DocumentLinkCreate, DocumentLinkUpdate } from '../models/documentLink.model';

const QK_BASE = ['documentLinks'] as const;

export function useProjectDocuments(projectId: string | undefined) {
  return useQuery({
    queryKey: [...QK_BASE, 'project', projectId],
    queryFn: () => listProjectDocuments(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useProgramDocuments(programId: string | undefined) {
  return useQuery({
    queryKey: [...QK_BASE, 'program', programId],
    queryFn: () => listProgramDocuments(programId!),
    enabled: !!programId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateDocumentLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DocumentLinkCreate) => createDocumentLink(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_BASE }),
  });
}

export function useUpdateDocumentLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DocumentLinkUpdate }) =>
      updateDocumentLink(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_BASE }),
  });
}

export function useDeactivateDocumentLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateDocumentLink(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_BASE }),
  });
}
