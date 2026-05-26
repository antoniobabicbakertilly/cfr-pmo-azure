import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import type { DocumentLink, DocumentLinkCreate, DocumentLinkUpdate } from '../models/documentLink.model';

const SET = ENTITY_SETS.documentLink;
const FIELDS: (keyof DocumentLink)[] = [
  'pmo_documentlinkid', 'pmo_name', 'pmo_sharepointurl',
  'pmo_category', 'pmo_description', 'statecode',
  'createdon', '_pmo_project_value', '_pmo_program_value',
];

export async function listDocumentLinks(filter: string): Promise<DocumentLink[]> {
  return dv.list<DocumentLink>(SET, {
    $select: FIELDS,
    $filter: `statecode eq 0 and ${filter}`,
    $orderby: 'createdon desc',
  });
}

export async function listProjectDocuments(projectId: string): Promise<DocumentLink[]> {
  return listDocumentLinks(`_pmo_project_value eq '${projectId}'`);
}

export async function listProgramDocuments(programId: string): Promise<DocumentLink[]> {
  return listDocumentLinks(`_pmo_program_value eq '${programId}'`);
}

export async function createDocumentLink(payload: DocumentLinkCreate): Promise<DocumentLink> {
  return dv.create<DocumentLink>(SET, payload);
}

export async function updateDocumentLink(id: string, payload: DocumentLinkUpdate): Promise<void> {
  return dv.update(SET, id, payload);
}

export async function deactivateDocumentLink(id: string): Promise<void> {
  return dv.deactivate(SET, id);
}
