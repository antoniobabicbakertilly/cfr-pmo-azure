import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listPrograms, getProgram, createProgram, updateProgram } from '../api/programs.api';
import type { ProgramUpdate } from '../models/program.model';

const KEYS = {
  all: ['programs'] as const,
  detail: (id: string) => ['programs', 'detail', id] as const,
};

export function usePrograms() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: listPrograms,
  });
}

export function useProgram(id: string | undefined) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ''),
    queryFn: () => getProgram(id!),
    enabled: !!id,
  });
}

export function useCreateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: object) => createProgram(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useUpdateProgram(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProgramUpdate) => updateProgram(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}
