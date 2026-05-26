/** msdyn_project — P4W core + PMO Accelerator (proj_*) + CFR custom (pmo_*) */
export interface Project {
  msdyn_projectid: string;
  msdyn_subject: string;
  statecode?: 0 | 1;
  statuscode?: number;
  createdon?: string;
  modifiedon?: string;
  ownerid?: string;
  'ownerid@OData.Community.Display.V1.FormattedValue'?: string;

  // ── Description / narrative ────────────────────────────────────────────────
  msdyn_description?: string;
  msdyn_businesscase?: string;          // Business case tab
  msdyn_valuestatement?: string;        // Business case tab
  msdyn_comments?: string;

  // ── Schedule ───────────────────────────────────────────────────────────────
  msdyn_scheduledstart?: string;        // plan start
  msdyn_finish?: string;                // plan end — NOT msdyn_scheduledend (does not exist)
  msdyn_duration?: number;
  msdyn_progress?: number;              // 0–100
  msdyn_effort?: number;
  msdyn_effortcompleted?: number;
  msdyn_effortremaining?: number;
  msdyn_hoursperday?: number;
  msdyn_hoursperweek?: number;
  msdyn_dayspermonth?: number;
  msdyn_schedulemode?: number;
  'msdyn_schedulemode@OData.Community.Display.V1.FormattedValue'?: string;

  // ── Accelerator classification (proj_) ────────────────────────────────────
  proj_stage?: number;
  'proj_stage@OData.Community.Display.V1.FormattedValue'?: string;
  proj_state?: number;
  'proj_state@OData.Community.Display.V1.FormattedValue'?: string;
  proj_priority?: number;
  'proj_priority@OData.Community.Display.V1.FormattedValue'?: string;
  proj_projecttype?: number;
  'proj_projecttype@OData.Community.Display.V1.FormattedValue'?: string;
  proj_businessunit?: number;
  'proj_businessunit@OData.Community.Display.V1.FormattedValue'?: string;
  proj_fundingavailable?: boolean;
  proj_fundingsource?: number;
  'proj_fundingsource@OData.Community.Display.V1.FormattedValue'?: string;
  proj_needsstaffing?: boolean;

  // ── Accelerator health (proj_) ────────────────────────────────────────────
  proj_overallhealth?: number;          // On Track=189330000, At Risk=189330001, Off Track=189330002
  'proj_overallhealth@OData.Community.Display.V1.FormattedValue'?: string;
  proj_efforthealth?: number;
  'proj_efforthealth@OData.Community.Display.V1.FormattedValue'?: string;
  proj_financialhealth?: number;
  'proj_financialhealth@OData.Community.Display.V1.FormattedValue'?: string;
  proj_schedulehealth?: number;
  'proj_schedulehealth@OData.Community.Display.V1.FormattedValue'?: string;
  proj_issuehealth?: number;
  'proj_issuehealth@OData.Community.Display.V1.FormattedValue'?: string;
  proj_activerisks?: number;            // rollup
  proj_activeissues?: number;           // rollup
  proj_activechanges?: number;          // rollup

  // ── Accelerator financials (proj_) ────────────────────────────────────────
  proj_budget?: number;
  proj_actualcost?: number;
  proj_forecast?: number;
  proj_remainingbudget?: number;
  proj_budgetvariance?: number;
  proj_benefits?: number;
  proj_roi?: number;
  proj_prioritizationscore?: number;

  // ── Accelerator strategic scoring / Business case (proj_) ─────────────────
  proj_strategicalignment?: number;
  'proj_strategicalignment@OData.Community.Display.V1.FormattedValue'?: string;
  proj_strategicalignmentscore?: number;
  proj_improveemployeeretention?: number;
  'proj_improveemployeeretention@OData.Community.Display.V1.FormattedValue'?: string;
  proj_improveemployeeretentionscore?: number;
  proj_lowercost?: number;
  'proj_lowercost@OData.Community.Display.V1.FormattedValue'?: string;
  proj_lowercostscore?: number;
  proj_risk?: number;
  'proj_risk@OData.Community.Display.V1.FormattedValue'?: string;
  proj_riskscore?: number;

  // ── Lookup fields (use _fieldname_value in $select) ───────────────────────
  '_msdyn_msprojectdocument_value'?: string;   // Planner plan GUID (nullable until opened in P4W)
  '_msdyn_projectmanager_value'?: string;
  '_msdyn_projectmanager_value@OData.Community.Display.V1.FormattedValue'?: string;
  '_msdyn_program_value'?: string;
  '_msdyn_program_value@OData.Community.Display.V1.FormattedValue'?: string;
  '_proj_executivesponsor_value'?: string;
  '_proj_executivesponsor_value@OData.Community.Display.V1.FormattedValue'?: string;
  '_proj_manager_value'?: string;
  '_proj_manager_value@OData.Community.Display.V1.FormattedValue'?: string;

  // ── CFR custom extension (pmo_) ───────────────────────────────────────────
  '_pmo_primaryteam_value'?: string;
  '_pmo_primaryteam_value@OData.Community.Display.V1.FormattedValue'?: string;
  '_pmo_requestsource_value'?: string;
  '_pmo_requestsource_value@OData.Community.Display.V1.FormattedValue'?: string;
  pmo_cfrcategory?: number;
  'pmo_cfrcategory@OData.Community.Display.V1.FormattedValue'?: string;
  pmo_complexity?: number;
  'pmo_complexity@OData.Community.Display.V1.FormattedValue'?: string;
  pmo_strategicpriority?: number;
  'pmo_strategicpriority@OData.Community.Display.V1.FormattedValue'?: string;
}

/** Payload for PATCH updates on msdyn_project */
export type ProjectUpdate = Partial<
  Pick<
    Project,
    | 'msdyn_subject'
    | 'msdyn_description'
    | 'msdyn_scheduledstart'
    | 'msdyn_finish'
    | 'msdyn_businesscase'
    | 'msdyn_valuestatement'
    | 'msdyn_comments'
    | 'proj_priority'
    | 'proj_stage'
    | 'proj_projecttype'
    | 'proj_businessunit'
    | 'proj_fundingavailable'
    | 'proj_fundingsource'
    | 'proj_budget'
    | 'proj_forecast'
    | 'proj_benefits'
  >
> & {
  // CFR classification allows null to explicitly clear the field in Dataverse
  pmo_cfrcategory?: number | null;
  pmo_complexity?: number | null;
  pmo_strategicpriority?: number | null;
  // Health indicators — null clears; same 189330000/189330001/189330002 scale as proj_overallhealth
  proj_overallhealth?: number | null;
  proj_schedulehealth?: number | null;
  proj_efforthealth?: number | null;
  proj_financialhealth?: number | null;
  proj_issuehealth?: number | null;
  // Lookup binds — use NavigationPropertyName (PascalCase schema name, not logical name)
  'msdyn_projectmanager@odata.bind'?: string | null;
  'pmo_PrimaryTeam@odata.bind'?: string | null;
  'pmo_RequestSource@odata.bind'?: string | null;
  'msdyn_Program@odata.bind'?: string | null;
  'proj_ExecutiveSponsor@odata.bind'?: string | null;
  'proj_Manager@odata.bind'?: string | null;
};
