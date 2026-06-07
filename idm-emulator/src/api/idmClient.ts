import axios from 'axios';
import type { AvanpostOperation, IdmEvent, WebhookResponse } from '../types/idm.types';

const API = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function sendWebhookEvent(event: IdmEvent): Promise<WebhookResponse> {
  const { data } = await API.post<WebhookResponse>('/webhooks/avanpost', event);
  return data;
}

export async function runMockScenario(
  scenarioName: string,
): Promise<{ success: boolean; event: IdmEvent }> {
  const { data } = await API.post<{ success: boolean; event: IdmEvent }>(
    `/mock-idm/scenario/${scenarioName}`,
  );
  return data;
}

export async function sendCustomEvent(event: IdmEvent): Promise<{ success: boolean }> {
  const { data } = await API.post<{ success: boolean }>('/mock-idm/send-event', event);
  return data;
}

export async function getTargetSystem(name: string): Promise<{ name: string; type: string; config: Record<string, unknown> } | null> {
  try {
    const { data } = await API.get(`/admin/target-systems/name/${name}`);
    if (data && data.success === false) return null;
    return data;
  } catch {
    return null;
  }
}

export function buildEvent(
  operation: AvanpostOperation,
  targetSystem: string,
  payload: Record<string, unknown>,
): IdmEvent {
  return {
    eventId: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${crypto.randomUUID?.() ?? ''}`,
    operation,
    targetSystem,
    payload,
  };
}
