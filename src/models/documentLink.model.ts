/** pmo_documentlink — project/program document metadata linked to SharePoint */
export interface DocumentLink {
  pmo_documentlinkid: string;
  pmo_name: string;
  pmo_sharepointurl: string;
  pmo_category?: number;
  pmo_description?: string;
  pmo_sharepointitemid?: string;
  pmo_filesize?: number;
  pmo_modifiedbyname?: string;
  statecode?: 0 | 1;
  createdon?: string;
  modifiedon?: string;
  '_pmo_project_value'?: string;
  '_pmo_program_value'?: string;
}

export type DocumentLinkCreate = {
  pmo_name: string;
  pmo_sharepointurl: string;
  pmo_category?: number;
  pmo_description?: string;
  pmo_sharepointitemid?: string;
  pmo_filesize?: number;
  pmo_modifiedbyname?: string;
  'pmo_Project@odata.bind'?: string;
  'pmo_Program@odata.bind'?: string;
};

export type DocumentLinkUpdate = Partial<
  Pick<DocumentLink, 'pmo_name' | 'pmo_sharepointurl' | 'pmo_category' | 'pmo_description'>
>;
