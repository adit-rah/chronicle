import React, { useState, useEffect, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Activity, RefreshCw, Wifi, WifiOff, ExternalLink, GitCommit } from 'lucide-react';
import { Event, EventFilter, Stats, SourceType, EventCategory } from './types';
import { useWebSocket } from './hooks/useWebSocket';
import { fetchEvents, fetchStats } from './api';

const sourceColors: Record<SourceType, string> = {
  rss: '#f97316',      // orange
  github: '#22c55e',   // green  
  weather: '#3b82f6',  // blue
  jobs: '#a855f7',     // purple
};

const categoryShorts: Record<EventCategory, string> = {
  article: 'post',
  commit: 'commit',
  weather: 'weather',
  job_posting: 'job',
  issue: 'issue',
  pull_request: 'pr',
  release: 'release',
};

function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<EventFilter>({ limit: 100 });
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const { isConnected, lastEvent } = useWebSocket('ws://localhost:8080/api/v1/ws');

  // Load initial events and stats
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [eventsResponse, statsResponse] = await Promise.all([
        fetchEvents(filter),
        fetchStats()
      ]);
      setEvents(eventsResponse.events);
      setStats(statsResponse);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Add new events from WebSocket
  useEffect(() => {
    if (lastEvent) {
      setEvents(prev => [lastEvent, ...prev].slice(0, filter.limit || 100));
    }
  }, [lastEvent, filter.limit]);

  const formatCommitTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const formatCommitDate = (timestamp: string) => {
    return format(new Date(timestamp), 'MMM dd HH:mm');
  };

  const getShortHash = (sourceId: string) => {
    // Create a short hash-like string from source ID
    return sourceId.substring(0, 7);
  };

  const renderCommitLine = (event: Event, index: number) => (
    <div key={event.id} className="commit-line">
      <div className="commit-graph">
        <div 
          className="commit-dot"
          style={{ backgroundColor: sourceColors[event.source_type] }}
        />
        {index < events.length - 1 && <div className="commit-line-connector" />}
      </div>
      
      <div className="commit-content">
        <div className="commit-header">
          <span 
            className="commit-hash"
            style={{ color: sourceColors[event.source_type] }}
          >
            {getShortHash(event.source_id)}
          </span>
          <span className="commit-title">
            {event.link ? (
              <a href={event.link} target="_blank" rel="noopener noreferrer" className="commit-link">
                {event.title}
                <ExternalLink size={12} />
              </a>
            ) : (
              event.title
            )}
          </span>
        </div>
        
        <div className="commit-meta">
          <span className="commit-author">{event.source_type}</span>
          <span className="commit-type">[{categoryShorts[event.category]}]</span>
          <span className="commit-time">{formatCommitTime(event.timestamp)}</span>
          <span className="commit-date">({formatCommitDate(event.timestamp)})</span>
        </div>

        {event.metadata && Object.keys(event.metadata).length > 0 && (
          <div className="commit-details">
            {event.metadata.author && <span>Author: {event.metadata.author}</span>}
            {event.metadata.company && <span>Company: {event.metadata.company}</span>}
            {event.metadata.location && <span>Location: {event.metadata.location}</span>}
            {event.metadata.temperature && <span>Temp: {event.metadata.temperature}°C</span>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <GitCommit size={20} />
          <h1>chronicle: event-aggregator</h1>
          <span className="branch-info">main</span>
        </div>
        
        <div className="header-right">
          <div className="connection-status">
            {isConnected ? (
              <><Wifi size={14} /> live</>
            ) : (
              <><WifiOff size={14} /> offline</>
            )}
          </div>
          
          {stats && (
            <div className="stats">
              {stats.total_events} events
            </div>
          )}
          
          <button onClick={loadData} className="refresh-btn" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {loading && events.length === 0 ? (
          <div className="loading">Fetching events...</div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <div>No events found.</div>
            <div className="hint">Events will appear here as they are aggregated.</div>
          </div>
        ) : (
          <div className="commit-log">
            {events.map((event, index) => renderCommitLine(event, index))}
          </div>
        )}
      </main>

      {/* Styles */}
      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .app {
          min-height: 100vh;
          background: #0d1117;
          color: #f0f6fc;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.4;
        }

        .app-header {
          background: #161b22;
          border-bottom: 1px solid #30363d;
          padding: 12px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .header-left h1 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #f0f6fc;
        }

        .branch-info {
          background: #21262d;
          color: #7d8590;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 12px;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 4px;
          color: ${isConnected ? '#2ea043' : '#f85149'};
        }

        .stats {
          color: #7d8590;
        }

        .refresh-btn {
          background: #21262d;
          border: 1px solid #30363d;
          color: #f0f6fc;
          border-radius: 4px;
          padding: 4px 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          font-size: 12px;
        }

        .refresh-btn:hover {
          background: #30363d;
        }

        .refresh-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .main-content {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .loading, .empty-state {
          text-align: center;
          padding: 40px;
          color: #7d8590;
        }

        .empty-state .hint {
          font-size: 12px;
          margin-top: 8px;
          color: #656d76;
        }

        .commit-log {
          background: #0d1117;
        }

        .commit-line {
          display: flex;
          margin-bottom: 0;
          position: relative;
        }

        .commit-graph {
          width: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-right: 12px;
          position: relative;
        }

        .commit-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-top: 6px;
          z-index: 1;
        }

        .commit-line-connector {
          width: 2px;
          background: #30363d;
          flex: 1;
          margin-top: 2px;
        }

        .commit-content {
          flex: 1;
          padding-bottom: 16px;
        }

        .commit-header {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 4px;
        }

        .commit-hash {
          font-weight: 600;
          font-size: 12px;
          min-width: 60px;
        }

        .commit-title {
          flex: 1;
          color: #f0f6fc;
        }

        .commit-link {
          color: #58a6ff;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .commit-link:hover {
          text-decoration: underline;
        }

        .commit-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #7d8590;
          font-size: 12px;
          margin-left: 68px;
        }

        .commit-author {
          color: #f0f6fc;
        }

        .commit-type {
          color: #7d8590;
        }

        .commit-time {
          color: #7d8590;
        }

        .commit-date {
          color: #656d76;
          font-size: 11px;
        }

        .commit-details {
          margin-left: 68px;
          margin-top: 4px;
          color: #7d8590;
          font-size: 11px;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        @media (max-width: 768px) {
          .app-header {
            padding: 8px 12px;
            flex-direction: column;
            gap: 8px;
          }

          .main-content {
            padding: 12px;
          }

          .commit-meta {
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
          }

          .commit-details {
            flex-direction: column;
            gap: 2px;
          }
        }
      `}</style>
    </div>
  );
}

export default App; 