import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Activity, Filter, RefreshCw, Wifi, WifiOff, ExternalLink } from 'lucide-react';
import { Event, EventFilter, Stats, SourceType, EventCategory } from './types';
import { useWebSocket } from './hooks/useWebSocket';
import { fetchEvents, fetchStats } from './api';

const sourceTypeColors: Record<SourceType, string> = {
  rss: '#3b82f6',      // blue
  github: '#10b981',   // green
  weather: '#f59e0b',  // amber
  jobs: '#8b5cf6',     // purple
};

const categoryIcons: Record<EventCategory, string> = {
  article: '📰',
  commit: '💻',
  weather: '🌤️',
  job_posting: '💼',
  issue: '🐛',
  pull_request: '🔄',
  release: '🚀',
};

function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<EventFilter>({ limit: 50 });
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

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
      setEvents(prev => [lastEvent, ...prev].slice(0, filter.limit || 50));
    }
  }, [lastEvent, filter.limit]);

  const handleFilterChange = (newFilter: Partial<EventFilter>) => {
    setFilter(prev => ({ ...prev, ...newFilter }));
  };

  const handleSearch = () => {
    if (searchKeyword.trim()) {
      handleFilterChange({ keywords: [searchKeyword.trim()] });
    } else {
      handleFilterChange({ keywords: undefined });
    }
  };

  const getSourceTypeColor = (sourceType: SourceType) => sourceTypeColors[sourceType];
  const getCategoryIcon = (category: EventCategory) => categoryIcons[category] || '📄';

  const formatTimestamp = (timestamp: string) => {
    return format(new Date(timestamp), 'MMM dd, HH:mm');
  };

  const renderEvent = (event: Event) => (
    <div key={event.id} className="event-card">
      <div className="event-header">
        <div className="event-source">
          <div 
            className="source-indicator"
            style={{ backgroundColor: getSourceTypeColor(event.source_type) }}
          />
          <span className="source-type">{event.source_type.toUpperCase()}</span>
          <span className="category-icon">{getCategoryIcon(event.category)}</span>
        </div>
        <div className="event-time">{formatTimestamp(event.timestamp)}</div>
      </div>
      
      <div className="event-content">
        <h3 className="event-title">
          {event.link ? (
            <a href={event.link} target="_blank" rel="noopener noreferrer" className="event-link">
              {event.title}
              <ExternalLink size={14} />
            </a>
          ) : (
            event.title
          )}
        </h3>
        
        {event.metadata && (
          <div className="event-metadata">
            {event.metadata.company && (
              <span className="metadata-tag">🏢 {event.metadata.company}</span>
            )}
            {event.metadata.location && (
              <span className="metadata-tag">📍 {event.metadata.location}</span>
            )}
            {event.metadata.author && (
              <span className="metadata-tag">👤 {event.metadata.author}</span>
            )}
            {event.metadata.temperature && (
              <span className="metadata-tag">🌡️ {event.metadata.temperature}°C</span>
            )}
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
          <Activity size={24} />
          <h1>Event Stream Dashboard</h1>
        </div>
        
        <div className="header-right">
          <div className="connection-status">
            {isConnected ? (
              <><Wifi size={16} /> Connected</>
            ) : (
              <><WifiOff size={16} /> Disconnected</>
            )}
          </div>
          
          {stats && (
            <div className="stats-summary">
              <span>{stats.total_events} total events</span>
              <span>{stats.active_workers} workers</span>
            </div>
          )}
          
          <button onClick={loadData} className="refresh-btn" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          </button>
          
          <button 
            onClick={() => setShowFilters(!showFilters)} 
            className="filter-btn"
          >
            <Filter size={16} />
          </button>
        </div>
      </header>

      {/* Filters */}
      {showFilters && (
        <div className="filters-panel">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search events..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch}>Search</button>
          </div>
          
          <div className="filter-options">
            <div className="filter-group">
              <label>Source Types:</label>
              <div className="checkbox-group">
                {Object.keys(sourceTypeColors).map(sourceType => (
                  <label key={sourceType} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={filter.source_types?.includes(sourceType as SourceType) || false}
                      onChange={(e) => {
                        const currentTypes = filter.source_types || [];
                        if (e.target.checked) {
                          handleFilterChange({ 
                            source_types: [...currentTypes, sourceType as SourceType] 
                          });
                        } else {
                          handleFilterChange({ 
                            source_types: currentTypes.filter(t => t !== sourceType) 
                          });
                        }
                      }}
                    />
                    <span style={{ color: sourceTypeColors[sourceType as SourceType] }}>
                      {sourceType.toUpperCase()}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="main-content">
        {loading && events.length === 0 ? (
          <div className="loading">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <Activity size={48} />
            <h2>No events yet</h2>
            <p>Events will appear here as they are aggregated from your configured sources.</p>
          </div>
        ) : (
          <div className="events-timeline">
            {events.map(renderEvent)}
          </div>
        )}
      </main>

      {/* Styles */}
      <style jsx>{`
        .app {
          min-height: 100vh;
          background: #f5f5f5;
        }

        .app-header {
          background: white;
          border-bottom: 1px solid #e0e0e0;
          padding: 1rem 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .header-left h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: #333;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.875rem;
          color: ${isConnected ? '#10b981' : '#ef4444'};
        }

        .stats-summary {
          display: flex;
          gap: 1rem;
          font-size: 0.875rem;
          color: #666;
        }

        .refresh-btn, .filter-btn {
          background: #f3f4f6;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 0.5rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          transition: background-color 0.2s;
        }

        .refresh-btn:hover, .filter-btn:hover {
          background: #e5e7eb;
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

        .filters-panel {
          background: white;
          border-bottom: 1px solid #e0e0e0;
          padding: 1rem 2rem;
        }

        .search-bar {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .search-bar input {
          flex: 1;
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.875rem;
        }

        .search-bar button {
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-size: 0.875rem;
        }

        .filter-options {
          display: flex;
          gap: 2rem;
        }

        .filter-group label {
          font-weight: 500;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
          display: block;
        }

        .checkbox-group {
          display: flex;
          gap: 1rem;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .main-content {
          padding: 2rem;
          max-width: 800px;
          margin: 0 auto;
        }

        .loading, .empty-state {
          text-align: center;
          padding: 3rem;
          color: #666;
        }

        .empty-state h2 {
          margin: 1rem 0 0.5rem;
          color: #333;
        }

        .events-timeline {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .event-card {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .event-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }

        .event-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .event-source {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .source-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .source-type {
          font-size: 0.75rem;
          font-weight: 600;
          color: #666;
        }

        .category-icon {
          font-size: 1rem;
        }

        .event-time {
          font-size: 0.75rem;
          color: #666;
        }

        .event-title {
          margin: 0 0 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          line-height: 1.4;
        }

        .event-link {
          color: #3b82f6;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .event-link:hover {
          text-decoration: underline;
        }

        .event-metadata {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .metadata-tag {
          background: #f3f4f6;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #374151;
        }

        @media (max-width: 768px) {
          .app-header {
            padding: 1rem;
            flex-direction: column;
            gap: 1rem;
          }

          .header-right {
            flex-wrap: wrap;
            justify-content: center;
          }

          .main-content {
            padding: 1rem;
          }

          .filters-panel {
            padding: 1rem;
          }

          .filter-options {
            flex-direction: column;
          }

          .checkbox-group {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
}

export default App; 