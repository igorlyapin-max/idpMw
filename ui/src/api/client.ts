import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010';
const API_KEY = import.meta.env.VITE_API_KEY || '';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
  },
});

export interface DlqItem {
  id: string;
  eventId: string;
  operation: string;
  targetSystem: string;
  payload: Record<string, unknown>;
  error: string;
  retryCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchDlqItems(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<DlqItem[]> {
  const res = await apiClient.get('/admin/dlq', { params });
  return res.data as DlqItem[];
}

export async function retryDlqItem(id: string): Promise<void> {
  await apiClient.post(`/admin/dlq/${id}/retry`);
}

export async function skipDlqItem(id: string): Promise<void> {
  await apiClient.post(`/admin/dlq/${id}/skip`);
}
