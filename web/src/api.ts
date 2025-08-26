import { EventsResponse, EventFilter, Stats, HealthResponse, EventListener, EventTag, ListenersResponse, TagsResponse } from './types';

const API_BASE = '/api/v1';

// Generic API helpers
async function fetchAPI<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  return response.json();
}

async function postAPI<T>(endpoint: string, data: any): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  
  return response.json();
}

async function putAPI<T>(endpoint: string, data: any): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  
  return response.json();
}

async function deleteAPI(endpoint: string): Promise<void> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
}

// Event API
export async function fetchEvents(filter: EventFilter = {}): Promise<EventsResponse> {
  const params = new URLSearchParams();
  
  Object.entries(filter).forEach(([key, value]) => {
    if (value != null) {
      if (Array.isArray(value) && value.length > 0) {
        params.append(key, value.join(','));
      } else if (!Array.isArray(value)) {
        params.append(key, value.toString());
      }
    }
  });
  
  const queryString = params.toString();
  const endpoint = queryString ? `/events?${queryString}` : '/events';
  
  return fetchAPI<EventsResponse>(endpoint);
}

export const fetchStats = (): Promise<Stats> => 
  fetchAPI<Stats>('/stats');

export const fetchHealth = (): Promise<HealthResponse> => 
  fetchAPI<HealthResponse>('/health');

// Listener API
export const fetchListeners = (): Promise<ListenersResponse> => 
  fetchAPI<ListenersResponse>('/listeners');

export const createListener = (listener: Omit<EventListener, 'id' | 'created_at' | 'updated_at'>): Promise<EventListener> => 
  postAPI<EventListener>('/listeners', listener);

export const updateListener = (id: number, listener: Omit<EventListener, 'created_at' | 'updated_at'>): Promise<EventListener> => 
  putAPI<EventListener>(`/listeners/${id}`, listener);

export const deleteListener = (id: number): Promise<void> => 
  deleteAPI(`/listeners/${id}`);

// Tag API
export const fetchTags = (): Promise<TagsResponse> => 
  fetchAPI<TagsResponse>('/tags');

export const createTag = (tag: Omit<EventTag, 'id' | 'created_at'>): Promise<EventTag> => 
  postAPI<EventTag>('/tags', tag);

export const deleteTag = (id: number): Promise<void> => 
  deleteAPI(`/tags/${id}`);