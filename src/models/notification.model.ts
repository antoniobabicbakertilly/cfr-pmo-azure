export interface Notification {
  pmo_notificationid: string;
  pmo_title: string;
  pmo_body?: string;
  pmo_category: number;
  pmo_isread: boolean;
  pmo_actionurl?: string;
  statecode?: 0 | 1;
  createdon?: string;
  '_pmo_targetuser_value'?: string;
  '_pmo_project_value'?: string;
  '_pmo_program_value'?: string;
}

export type NotificationCreate = {
  pmo_title: string;
  pmo_body?: string;
  pmo_category: number;
  pmo_isread?: boolean;
  pmo_actionurl?: string;
  'pmo_TargetUser@odata.bind': string;
  'pmo_Project@odata.bind'?: string;
  'pmo_Program@odata.bind'?: string;
};
