import { useMutation } from '@tanstack/react-query';
import { createTelemetryEvent } from '../api/telemetryEvents.api';
import type { TelemetryEventCreate } from '../models/telemetryEvent.model';

export function useCreateTelemetryEvent() {
  return useMutation({
    mutationFn: (payload: TelemetryEventCreate) => createTelemetryEvent(payload),
  });
}
