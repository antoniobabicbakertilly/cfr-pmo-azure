/** msdyn_projectbucket — Planner bucket (Kanban column) */
export interface ProjectBucket {
  msdyn_projectbucketid: string;
  msdyn_name: string;
  msdyn_displayorder?: number;
  statecode?: 0 | 1;
  createdon?: string;

  '_msdyn_project_value'?: string;
}
