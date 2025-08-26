import { useState, useEffect, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { RefreshCw, Wifi, WifiOff, ExternalLink, GitCommit, Settings, Tag } from 'lucide-react';
import { Event, EventFilter, Stats, SourceType, EventCategory } from './types';
import { useWebSocket } from './hooks/useWebSocket';
import { fetchEvents, fetchStats } from './api';
import { ListenerManagement } from './components/ListenerManagement';
import { TagManagement } from './components/TagManagement';

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
  const [filter] = useState<EventFilter>({ limit: 100 });
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'listeners' | 'tags'>('listeners');

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
          <button 
            className="refresh-btn"
            onClick={() => setShowSettings(true)}
          >
            <Settings size={16} />
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

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-overlay">
          <div className="settings-modal">
            <div className="settings-header">
              <h2>Settings</h2>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowSettings(false)}
              >
                Close
              </button>
            </div>

            <div className="settings-tabs">
              <button 
                className={`tab-btn ${activeTab === 'listeners' ? 'active' : ''}`}
                onClick={() => setActiveTab('listeners')}
              >
                Event Listeners
              </button>
              <button 
                className={`tab-btn ${activeTab === 'tags' ? 'active' : ''}`}
                onClick={() => setActiveTab('tags')}
              >
                <Tag size={14} />
                Tags
              </button>
            </div>

            <div className="settings-content">
              {activeTab === 'listeners' && (
                <ListenerManagement />
              )}
              {activeTab === 'tags' && (
                <TagManagement />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Styles */}
      <style>{`
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

        /* Settings Modal Styles */
        .settings-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(1, 4, 9, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .settings-modal {
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 8px;
          max-width: 90vw;
          max-height: 90vh;
          width: 900px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #30363d;
        }

        .settings-header h2 {
          margin: 0;
          color: #f0f6fc;
          font-size: 18px;
          font-weight: 600;
        }

        .settings-tabs {
          display: flex;
          background: #161b22;
          border-bottom: 1px solid #30363d;
        }

        .tab-btn {
          background: transparent;
          border: none;
          color: #7d8590;
          padding: 12px 16px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .tab-btn:hover {
          color: #f0f6fc;
        }

        .tab-btn.active {
          color: #f0f6fc;
          border-bottom-color: #fd7e14;
        }

        .settings-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .btn {
          background: #21262d;
          border: 1px solid #30363d;
          color: #f0f6fc;
          border-radius: 6px;
          padding: 6px 12px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          text-decoration: none;
        }

        .btn:hover {
          background: #30363d;
          border-color: #8b949e;
        }

        .btn-primary {
          background: #238636;
          border-color: #238636;
        }

        .btn-primary:hover {
          background: #2ea043;
          border-color: #2ea043;
        }

        .btn-secondary {
          background: #21262d;
          border-color: #30363d;
        }

        .btn-icon {
          background: transparent;
          border: none;
          color: #7d8590;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
        }

        .btn-icon:hover {
          color: #f0f6fc;
          background: #30363d;
        }

        .btn-icon.danger:hover {
          color: #f85149;
        }

        /* Component Styles */
        .listener-management,
        .tag-management {
          background: transparent;
          border: none;
          padding: 0;
          margin: 0;
        }

        .listener-header,
        .tag-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid #30363d;
        }

        .listener-header h3,
        .tag-header h3 {
          margin: 0;
          color: #f0f6fc;
          font-size: 16px;
          font-weight: 600;
        }

        .listener-form-overlay,
        .tag-form-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(1, 4, 9, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1100;
        }

        .listener-form,
        .tag-form {
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 24px;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .listener-form h4,
        .tag-form h4 {
          margin: 0 0 20px 0;
          color: #f0f6fc;
          font-size: 16px;
          font-weight: 600;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 6px;
          color: #f0f6fc;
          font-size: 13px;
          font-weight: 500;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 6px;
          padding: 8px 12px;
          color: #f0f6fc;
          font-size: 13px;
          box-sizing: border-box;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #58a6ff;
          box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.1);
        }

        .form-group input[type="checkbox"] {
          width: auto;
          margin-right: 8px;
        }

        .form-hint {
          color: #7d8590;
          font-size: 12px;
          font-style: italic;
          margin-top: 4px;
        }

        .config-fields {
          margin-top: 8px;
        }

        .config-field {
          margin-bottom: 12px;
        }

        .config-field label {
          display: block;
          margin-bottom: 4px;
          color: #f0f6fc;
          font-size: 12px;
          font-weight: 500;
          text-transform: capitalize;
        }

        .tag-selection {
          margin-top: 8px;
        }

        .selected-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 8px;
        }

        .selected-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          color: white;
        }

        .remove-tag {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0;
          margin-left: 4px;
        }

        .remove-tag:hover {
          opacity: 0.7;
        }

        .no-config {
          color: #7d8590;
          font-style: italic;
          margin: 8px 0;
        }

        .raw-config-editor {
          margin-top: 12px;
          border: 1px solid #30363d;
          border-radius: 6px;
          padding: 8px;
        }

        .raw-config-editor summary {
          cursor: pointer;
          color: #7d8590;
          font-size: 12px;
          margin-bottom: 8px;
        }

        .raw-config-editor summary:hover {
          color: #f0f6fc;
        }

        .raw-config-editor textarea {
          width: 100%;
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 4px;
          padding: 8px;
          color: #f0f6fc;
          font-size: 12px;
        }

        .form-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #30363d;
        }

        .listeners-list,
        .tags-list {
          min-height: 200px;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #7d8590;
        }

        .empty-state {
          text-align: center;
          padding: 40px;
          color: #7d8590;
        }

        .empty-state .hint {
          font-size: 12px;
          margin-top: 8px;
          color: #656d76;
        }

        .listeners-table {
          border: 1px solid #30363d;
          border-radius: 6px;
          overflow: hidden;
        }

        .listener-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #30363d;
        }

        .listener-row:last-child {
          border-bottom: none;
        }

        .listener-row.disabled {
          opacity: 0.6;
        }

        .listener-info {
          flex: 1;
        }

        .listener-name {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #f0f6fc;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .status-icon.enabled {
          color: #2ea043;
        }

        .status-icon.disabled {
          color: #7d8590;
        }

        .listener-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 12px;
          color: #7d8590;
        }

        .listener-type {
          background: #21262d;
          color: #7d8590;
          padding: 2px 6px;
          border-radius: 3px;
          text-transform: uppercase;
          font-size: 10px;
          font-weight: 600;
        }

        .listener-tags {
          display: flex;
          gap: 4px;
        }

        .tag {
          background: #1f6feb;
          color: #f0f6fc;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
        }

        .listener-actions {
          display: flex;
          gap: 4px;
        }

        .tags-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }

        .tag-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 6px;
        }

        .tag-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #f0f6fc;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .color-picker {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
          flex-wrap: wrap;
        }

        .color-option {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          border: 2px solid transparent;
          cursor: pointer;
        }

        .color-option.selected {
          border-color: #f0f6fc;
        }
      `}</style>
    </div>
  );
}

export default App; 