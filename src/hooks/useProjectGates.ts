import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listProjectGates, createProjectGate, updateProjectGate,
  listGateDecisions, createGateDecision,
} from '../api/projectGates.api';
import type { ProjectGateCreate, ProjectGateUpdate, ProjectGateDecisionCreate } from '../models/projectGate.model';

const QK = (projectId: string) => ['projectGates', projectId] as const;
const DQK = (gateId: string) => ['gateDecisions', gateId] as const;

export function useProjectGates(projectId: string | undefined) {
  return useQuery({
    queryKey: QK(projectId ?? ''),
    queryFn: () => listProjectGates(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProjectGate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectGateCreate) => createProjectGate(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
  });
}

export function useUpdateProjectGate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProjectGateUpdate }) =>
      updateProjectGate(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(projectId) }),
  });
}

export function useGateDecisions(gateId: string | undefined) {
  return useQuery({
    queryKey: DQK(gateId ?? ''),
    queryFn: () => listGateDecisions(gateId!),
    enabled: !!gateId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateGateDecision(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectGateDecisionCreate) => createGateDecision(payload),
    onSuccess: (_data, variables) => {
      const gateId = variables['pmo_Gate@odata.bind'].replace(/.*\(|\)/g, '');
      qc.invalidateQueries({ queryKey: DQK(gateId) });
      qc.invalidateQueries({ queryKey: QK(projectId) });
    },
  });
}
