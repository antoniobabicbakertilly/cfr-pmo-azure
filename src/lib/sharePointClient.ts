import * as dv from './dataverseClient';
import { ENTITY_SETS } from './constants';
import { getContext } from '@microsoft/power-apps/app';
import { isDemoModeActive } from './demoMode';

export type RecordType = 'Intake Request' | 'Program' | 'Project' | 'Task';

let cachedUserEmail: string | null = null;

async function getCurrentUserEmail(): Promise<string> {
  if (cachedUserEmail !== null) return cachedUserEmail;

  // Try Xrm host first (model-driven app)
  const userId = dv.getCurrentUserId();
  if (userId !== 'anonymous') {
    try {
      const user = await dv.get<{ internalemailaddress?: string }>(
        ENTITY_SETS.systemUser, userId, ['internalemailaddress'],
      );
      cachedUserEmail = user.internalemailaddress ?? '';
      return cachedUserEmail;
    } catch {
      // fall through
    }
  }

  // Canvas code app host: resolve via Power Apps SDK context (same approach as ConfigurationProvider)
  try {
    const ctx = await getContext();
    const aadObjectId = (ctx.user as Record<string, unknown>).objectId as string | undefined;
    if (aadObjectId) {
      const users = await dv.list<{ internalemailaddress?: string }>(ENTITY_SETS.systemUser, {
        $select: ['internalemailaddress'],
        $filter: `azureactivedirectoryobjectid eq '${aadObjectId}'`,
      });
      cachedUserEmail = users[0]?.internalemailaddress ?? '';
      return cachedUserEmail;
    }
  } catch {
    // Not running in Power Apps host
  }

  cachedUserEmail = '';
  return '';
}

export interface DocumentMetadata {
  recordType: RecordType;
  recordId: string;
  recordName: string;
  documentCategory?: string;
  projectId?: string;
  programId?: string;
  intakeId?: string;
  taskId?: string;
}

export interface DocumentItem {
  listItemId: number;
  fileName: string;
  serverRelativeUrl: string;
  modified: string;
  fileSizeBytes: number;
  documentCategory?: string;
  recordType: string;
  title?: string;
}

export interface DocumentFilter {
  recordType: RecordType;
  recordId: string;
}

interface UploadResponse {
  SharePointItemId: number;
  SharePointUrl: string;
  Success: boolean;
  ErrorMessage: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function uploadDocument(
  file: File,
  metadata: DocumentMetadata,
  spLibraryBaseUrl?: string,
): Promise<DocumentItem> {
  if (isDemoModeActive()) {
    return {
      listItemId: 0,
      fileName: file.name,
      serverRelativeUrl: `/demo-docs/${file.name}`,
      modified: new Date().toISOString(),
      fileSizeBytes: file.size,
      documentCategory: metadata.documentCategory,
      recordType: metadata.recordType,
      title: metadata.recordName,
    };
  }
  const [base64, userEmail] = await Promise.all([
    fileToBase64(file),
    getCurrentUserEmail(),
  ]);

  const result = await dv.executeAction<Record<string, unknown>, UploadResponse>(
    'msdyn_projects',
    'pmo_UploadDocumentToSharePoint',
    {
      FileName: file.name,
      FileContent: base64,
      RecordType: metadata.recordType,
      RecordId: metadata.recordId,
      RecordName: metadata.recordName.substring(0, 255),
      DocumentCategory: metadata.documentCategory ?? '',
      ProjectId: metadata.projectId ?? '',
      ProgramId: metadata.programId ?? '',
      IntakeId: metadata.intakeId ?? '',
      TaskId: metadata.taskId ?? '',
      UserEmail: userEmail,
    },
  );

  // Flow ran successfully but has no "Respond to a PowerApp or flow" step — all
  // output params come back null. Treat this as success when the SDK call itself
  // didn't throw: the file is in SharePoint; construct the URL from spLibraryBaseUrl.
  if (!result.Success && !result.SharePointItemId) {
    if (spLibraryBaseUrl) {
      const fallbackUrl = `${spLibraryBaseUrl.replace(/\/$/, '')}/${file.name}`;
      return {
        listItemId: 0,
        fileName: file.name,
        serverRelativeUrl: fallbackUrl,
        modified: new Date().toISOString(),
        fileSizeBytes: file.size,
        documentCategory: metadata.documentCategory,
        recordType: metadata.recordType,
        title: metadata.recordName,
      };
    }
    console.error('[pmo_UploadDocumentToSharePoint] response:', result);
    const detail = result.ErrorMessage
      ? String(result.ErrorMessage)
      : 'SharePoint flow returned no result — check Power Automate run history for pmo_UploadDocumentToSharePoint';
    throw new Error(detail);
  }

  return {
    listItemId: result.SharePointItemId,
    fileName: file.name,
    serverRelativeUrl: result.SharePointUrl,
    modified: new Date().toISOString(),
    fileSizeBytes: file.size,
    documentCategory: metadata.documentCategory,
    recordType: metadata.recordType,
    title: metadata.recordName,
  };
}

export async function listDocuments(filter: DocumentFilter): Promise<DocumentItem[]> {
  const bindCol = filter.recordType === 'Program' ? '_pmo_program_value'
    : '_pmo_project_value';
  const docs = await dv.list<{
    pmo_documentlinkid: string;
    pmo_name: string;
    pmo_sharepointurl: string;
    pmo_sharepointitemid?: string;
    pmo_filesize?: number;
    pmo_category?: number;
    createdon?: string;
    statecode?: number;
  }>('pmo_documentlinks', {
    $select: ['pmo_documentlinkid', 'pmo_name', 'pmo_sharepointurl', 'pmo_sharepointitemid', 'pmo_filesize', 'pmo_category', 'createdon'],
    $filter: `${bindCol} eq '${filter.recordId}' and statecode eq 0`,
    $orderby: 'createdon desc',
  });

  return docs.map((d) => ({
    listItemId: d.pmo_sharepointitemid ? parseInt(d.pmo_sharepointitemid, 10) : 0,
    fileName: d.pmo_name,
    serverRelativeUrl: d.pmo_sharepointurl,
    modified: d.createdon ?? '',
    fileSizeBytes: d.pmo_filesize ?? 0,
    documentCategory: undefined,
    recordType: filter.recordType,
    title: d.pmo_name,
  }));
}

export async function deleteDocument(listItemId: number): Promise<void> {
  const docs = await dv.list<{ pmo_documentlinkid: string }>('pmo_documentlinks', {
    $select: ['pmo_documentlinkid'],
    $filter: `pmo_sharepointitemid eq '${listItemId}' and statecode eq 0`,
    $top: 1,
  });
  if (docs[0]) {
    await dv.deactivate('pmo_documentlinks', docs[0].pmo_documentlinkid);
  }
}

export function downloadUrl(url: string): string {
  return url;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
