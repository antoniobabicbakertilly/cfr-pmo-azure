import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listSettings, upsertSetting, type AppSetting } from '../api/appSettings.api';

const QK = ['appSettings'] as const;

export function useAppSettings() {
  return useQuery({
    queryKey: QK,
    queryFn: listSettings,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useAppSetting(key: string): string | undefined {
  const { data } = useAppSettings();
  return data?.find((s) => s.pmo_key === key)?.pmo_value ?? undefined;
}

export function useUpsertSetting() {
  const qc = useQueryClient();
  const { data: settings } = useAppSettings();

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => {
      const existing = settings?.find((s) => s.pmo_key === key);
      return upsertSetting(key, value, existing);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export type { AppSetting };
