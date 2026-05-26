import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';

const SET = ENTITY_SETS.crSystem;

export interface CrSystem {
  cr87a_systemid: string;
  cr87a_name: string;
  cr87a_description?: string;
}

export async function listSystems(): Promise<CrSystem[]> {
  return dv.list<CrSystem>(SET, {
    $select: ['cr87a_systemid', 'cr87a_name'],
    $filter: 'statecode eq 0',
    $orderby: 'cr87a_name asc',
  });
}
