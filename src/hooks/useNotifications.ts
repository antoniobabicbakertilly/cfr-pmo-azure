import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listNotifications, createNotification, markAsRead, dismissNotification } from '../api/notifications.api';
import type { NotificationCreate } from '../models/notification.model';
import { getCurrentUserId } from '../lib/dataverseClient';
import { useConfig } from '../providers/ConfigurationProvider';

const QK = ['notifications'] as const;

export function useNotifications() {
  const userId = getCurrentUserId();
  const { config: { notificationDisplay } } = useConfig();
  const pollMs = notificationDisplay.pollIntervalMs;
  return useQuery({
    queryKey: [...QK, userId],
    queryFn: () => listNotifications(userId),
    staleTime: pollMs,
    refetchInterval: pollMs,
  });
}

export function useUnreadCount() {
  const { data = [] } = useNotifications();
  return data.filter((n) => !n.pmo_isread).length;
}

export function useCreateNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NotificationCreate) => createNotification(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useMarkAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markAsRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}
