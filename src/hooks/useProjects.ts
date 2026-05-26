import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listProjects, listActiveProjects, getProject, createProject, updateProject } from '../api/projects.api';
import type { ProjectUpdate } from '../models/project.model';
import type { ODataParams } from '../models/common.model';
import { useCanEditProject, assertCanEditProject } from './useProjectPermissions';

const KEYS = {
  all: ['projects'] as const,
  list: (params?: ODataParams) => [...KEYS.all, 'list', params] as const,
  active: () => [...KEYS.all, 'active'] as const,
  detail: (id: string) => [...KEYS.all, 'detail', id] as const,
};

export function useProjects(params?: ODataParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => listProjects(params),
  });
}

export function useActiveProjects() {
  return useQuery({
    queryKey: KEYS.active(),
    queryFn: listActiveProjects,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ''),
    queryFn: () => getProject(id!),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: object) => createProject(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  const permission = useCanEditProject(id);
  return useMutation({
    mutationFn: (payload: ProjectUpdate) => {
      assertCanEditProject(permission, 'update this project');
      return updateProject(id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}
