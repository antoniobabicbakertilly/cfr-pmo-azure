export interface ProjectDecision {
  pmo_projectdecisionid: string;
  pmo_name: string;
  pmo_description: string;
  pmo_decisiondate: string;
  pmo_status: number;
  pmo_impact?: number;
  pmo_rationale?: string;
  pmo_impactdescription?: string;
  statecode?: 0 | 1;
  createdon?: string;
  '_pmo_decisionowner_value'?: string;
  '_pmo_decisionowner_value@OData.Community.Display.V1.FormattedValue'?: string;
  '_pmo_project_value'?: string;
  '_pmo_program_value'?: string;
  '_pmo_meetinglink_value'?: string;
}

export type ProjectDecisionCreate = {
  pmo_name: string;
  pmo_description: string;
  pmo_decisiondate: string;
  pmo_status: number;
  pmo_impact?: number;
  pmo_rationale?: string;
  pmo_impactdescription?: string;
  'pmo_DecisionOwner@odata.bind'?: string;
  'pmo_Project@odata.bind'?: string;
  'pmo_Program@odata.bind'?: string;
  'pmo_MeetingLink@odata.bind'?: string;
};

export type ProjectDecisionUpdate = Partial<
  Pick<ProjectDecision, 'pmo_name' | 'pmo_description' | 'pmo_status' | 'pmo_impact' | 'pmo_rationale' | 'pmo_impactdescription'>
> & {
  'pmo_DecisionOwner@odata.bind'?: string | null;
  'pmo_MeetingLink@odata.bind'?: string | null;
};
