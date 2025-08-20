import { EventsResponse, EventFilter, Stats, HealthResponse } from './types';

const API_BASE = '/api/v1';

async function fetchAPI<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchEvents(filter: EventFilter = {}): Promise<EventsResponse> {
  const params = new URLSearchParams();
  
  if (filter.source_types?.length) {
    params.append('source_types', filter.source_types.join(','));
  }
  
  if (filter.categories?.length) {
    params.append('categories', filter.categories.join(','));
  }
  
  if (filter.keywords?.length) {
    params.append('keywords', filter.keywords.join(','));
  }
  
  if (filter.start_time) {
    params.append('start_time', filter.start_time);
  }
  
  if (filter.end_time) {
    params.append('end_time', filter.end_time);
  }
  
  if (filter.limit) {
    params.append('limit', filter.limit.toString());
  }
  
  if (filter.offset) {
    params.append('offset', filter.offset.toString());
  }
  
  const queryString = params.toString();
  const endpoint = queryString ? `/events?${queryString}` : '/events';
  
  return fetchAPI<EventsResponse>(endpoint);
}

export async function fetchStats(): Promise<Stats> {
  return fetchAPI<Stats>('/stats');
}

export async function fetchHealth(): Promise<HealthResponse> {
  return fetchAPI<HealthResponse>('/health');
} 