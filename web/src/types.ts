export type SourceType = 'rss' | 'github' | 'weather' | 'jobs';

export type EventCategory = 
  | 'article' 
  | 'commit' 
  | 'weather' 
  | 'job_posting' 
  | 'issue' 
  | 'pull_request' 
  | 'release';

export interface Event {
  id: number;
  source_type: SourceType;
  source_id: string;
  category: EventCategory;
  title: string;
  link: string;
  timestamp: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface EventFilter {
  source_types?: SourceType[];
  categories?: EventCategory[];
  keywords?: string[];
  start_time?: string;
  end_time?: string;
  limit?: number;
  offset?: number;
  tags?: string[];
}

export interface EventsResponse {
  events: Event[];
  total: number;
  filter: EventFilter;
}

export interface Stats {
  total_events: number;
  recent_events: number;
  source_stats: Record<string, number>;
  active_workers: number;
  connected_clients: number;
}

export interface WorkerInfo {
  name: string;
  source_type: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  active_workers: number;
  connected_clients: number;
  workers: WorkerInfo[];
}

export interface WebSocketMessage {
  type: 'event' | 'filter_ack';
  data: Event | any;
}

export interface EventListener {
  id: number;
  name: string;
  type: SourceType;
  enabled: boolean;
  config: Record<string, any>;
  tags: string[];
  interval: number;
  created_at: string;
  updated_at: string;
}

export interface EventTag {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface ListenersResponse {
  listeners: EventListener[];
}

export interface TagsResponse {
  tags: EventTag[];
} 