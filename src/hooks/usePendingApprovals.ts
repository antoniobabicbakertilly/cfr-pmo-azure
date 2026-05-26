import { useQuery } from '@tanstack/react-query';
import { listProjectRequests } from '../api/projectRequests.api';
import { REQUEST_STATUS } from '../lib/constants';

/**
 * Returns the count of intake requests awaiting approval action.
 * These are requests in Submitted or InTriage status — the statuses
 * that show the StageApprovalPanel on the IntakeDetailPage.
 */
export function usePendingApprovalCount(): number {
  const { data = [] } = useQuery({
    queryKey: ['pendingApprovals'],
    queryFn: () => listProjectRequests({
      $filter: `pmo_status eq ${REQUEST_STATUS.Submitted} or pmo_status eq ${REQUEST_STATUS.InTriage}`,
      $select: ['pmo_projectrequestid'],
    }),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  return data.length;
}
