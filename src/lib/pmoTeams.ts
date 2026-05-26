import * as dv from './dataverseClient';
import { ENTITY_SETS } from './constants';

/**
 * Fetches teams filtered by the configured PMO team boolean field.
 *
 * Falls back to all owner teams (teamtype eq 0) when the field does not exist
 * in the current environment, so queries work across DEV/UAT/prod regardless
 * of which publisher prefix the field carries.
 */
export async function fetchPmoTeams<T>(
  pmoTeamField: string,
  select: string[],
): Promise<T[]> {
  const withField = [...new Set([...select, pmoTeamField])];
  try {
    const all = await dv.list<T>(ENTITY_SETS.team, {
      $select: withField,
      $orderby: 'name asc',
    });
    return all.filter((t) => (t as Record<string, unknown>)[pmoTeamField] === true);
  } catch {
    // Field likely doesn't exist in this environment — return all owner teams
    const baseSelect = select.filter((f) => f !== pmoTeamField);
    const all = await dv.list<T>(ENTITY_SETS.team, {
      $select: baseSelect,
      $filter: 'teamtype eq 0',
      $orderby: 'name asc',
    });
    return all;
  }
}
