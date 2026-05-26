/** pmo_userfeedback — User-submitted bug reports and enhancement suggestions. */
export interface UserFeedback {
  pmo_userfeedbackid: string;
  pmo_title: string;
  pmo_description?: string;
  pmo_feedbacktype?: number;
  pmo_status?: number;
  pmo_priority?: number;
  pmo_responsecomments?: string;
  pmo_sourcecontext?: string;
  'pmo_feedbacktype@OData.Community.Display.V1.FormattedValue'?: string;
  'pmo_status@OData.Community.Display.V1.FormattedValue'?: string;
  'pmo_priority@OData.Community.Display.V1.FormattedValue'?: string;
  createdon?: string;
  '_createdby_value'?: string;
  '_createdby_value@OData.Community.Display.V1.FormattedValue'?: string;
  /** ownerid - polymorphic systemuser/team. The "Assigned To" column. */
  '_ownerid_value'?: string;
  '_ownerid_value@OData.Community.Display.V1.FormattedValue'?: string;
  '_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname'?: string;
  statecode?: 0 | 1;
}

export interface UserFeedbackCreate {
  pmo_title: string;
  pmo_description?: string;
  pmo_feedbacktype: number;
  pmo_status?: number;
  pmo_priority?: number;
  pmo_sourcecontext?: string;
}
