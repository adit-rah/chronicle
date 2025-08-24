import { EventsResponse, EventFilter, Stats, HealthResponse, EventListener, EventTag, ListenersResponse, TagsResponse } from './types';

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

// Listener API functions
export async function fetchListeners(): Promise<ListenersResponse> {
  return fetchAPI<ListenersResponse>('/listeners');
}

export async function createListener(listener: Omit<EventListener, 'id' | 'created_at' | 'updated_at'>): Promise<EventListener> {
  const response = await fetch(`${API_BASE}/listeners`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(listener),
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  
  return response.json();
}

export async function updateListener(id: number, listener: Omit<EventListener, 'created_at' | 'updated_at'>): Promise<EventListener> {
  const response = await fetch(`${API_BASE}/listeners/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(listener),
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  
  return response.json();
}

export async function deleteListener(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/listeners/${id}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
}

// Tag API functions
export async function fetchTags(): Promise<TagsResponse> {
  return fetchAPI<TagsResponse>('/tags');
}

export async function createTag(tag: Omit<EventTag, 'id' | 'created_at'>): Promise<EventTag> {
  const response = await fetch(`${API_BASE}/tags`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tag),
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  
  return response.json();
}

export async function deleteTag(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/tags/${id}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  return fetchAPI<HealthResponse>('/health');
} 