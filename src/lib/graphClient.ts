// Graph API client — stubbed for Azure SWA demo build (no auth available).

export interface CalendarEvent {
  id: string;
  subject: string;
  startDateTime: string;
  endDateTime: string;
  location: string;
  joinUrl: string;
  attendees: Array<{ email: string; name: string; response: string }>;
}

export async function isGraphAvailable(): Promise<boolean> {
  return false;
}

export async function createCalendarEvent(_params: {
  subject: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
  attendees?: Array<{ email: string; name: string }>;
  isOnlineMeeting?: boolean;
}): Promise<CalendarEvent> {
  throw new Error('Graph API not available in Azure SWA build');
}

export async function updateCalendarEvent(_eventId: string, _params: {
  subject?: string;
  startDateTime?: string;
  endDateTime?: string;
  location?: string;
}): Promise<CalendarEvent> {
  throw new Error('Graph API not available in Azure SWA build');
}

export async function getCalendarEvent(_eventId: string): Promise<CalendarEvent> {
  throw new Error('Graph API not available in Azure SWA build');
}
