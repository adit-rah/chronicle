import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Power, PowerOff } from 'lucide-react';
import { EventListener, SourceType } from '../types';
import { fetchListeners, createListener, updateListener, deleteListener } from '../api';

interface ListenerManagementProps {
  onClose?: () => void;
}

const sourceTypeOptions: { value: SourceType; label: string }[] = [
  { value: 'rss', label: 'RSS Feed' },
  { value: 'github', label: 'GitHub Repository' },
  { value: 'weather', label: 'Weather API' },
  { value: 'jobs', label: 'Job Listings' },
];

export function ListenerManagement({ onClose }: ListenerManagementProps) {
  const [listeners, setListeners] = useState<EventListener[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingListener, setEditingListener] = useState<EventListener | null>(null);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    type: 'rss' as SourceType,
    enabled: true,
    config: {},
    tags: [] as string[],
    interval: 900000000000, // 15 minutes in nanoseconds
  });

  useEffect(() => {
    loadListeners();
  }, []);

  const loadListeners = async () => {
    try {
      setLoading(true);
      const response = await fetchListeners();
      setListeners(response.listeners || []);
    } catch (error) {
      console.error('Failed to load listeners:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingListener) {
        await updateListener(editingListener.id, { ...formData, id: editingListener.id });
      } else {
        await createListener(formData);
      }
      await loadListeners();
      resetForm();
    } catch (error) {
      console.error('Failed to save listener:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this listener?')) {
      try {
        await deleteListener(id);
        await loadListeners();
      } catch (error) {
        console.error('Failed to delete listener:', error);
      }
    }
  };

  const handleEdit = (listener: EventListener) => {
    setEditingListener(listener);
    setFormData({
      name: listener.name,
      type: listener.type,
      enabled: listener.enabled,
      config: listener.config,
      tags: listener.tags,
      interval: listener.interval,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingListener(null);
    setFormData({
      name: '',
      type: 'rss',
      enabled: true,
      config: {},
      tags: [],
      interval: 900000000000,
    });
    setShowForm(false);
  };

  const formatInterval = (intervalNs: number) => {
    const seconds = intervalNs / 1000000000;
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  return (
    <div className="listener-management">
      <div className="listener-header">
        <h3>Event Listeners</h3>
        <button 
          className="btn btn-primary" 
          onClick={() => setShowForm(true)}
        >
          <Plus size={16} />
          Add Listener
        </button>
      </div>

      {showForm && (
        <div className="listener-form-overlay">
          <div className="listener-form">
            <h4>{editingListener ? 'Edit Listener' : 'New Listener'}</h4>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as SourceType })}
                >
                  {sourceTypeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Interval (minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={Math.floor(formData.interval / 60000000000)}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    interval: parseInt(e.target.value) * 60000000000 
                  })}
                />
              </div>

              <div className="form-group">
                <label>Configuration (JSON)</label>
                <textarea
                  value={JSON.stringify(formData.config, null, 2)}
                  onChange={(e) => {
                    try {
                      setFormData({ ...formData, config: JSON.parse(e.target.value) });
                    } catch {
                      // Invalid JSON, keep previous value
                    }
                  }}
                  rows={6}
                  placeholder='{"url": "https://example.com/feed"}'
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingListener ? 'Update' : 'Create'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="listeners-list">
        {loading ? (
          <div className="loading">Loading listeners...</div>
        ) : listeners.length === 0 ? (
          <div className="empty-state">
            <p>No listeners configured.</p>
            <p className="hint">Add a listener to start aggregating events from external sources.</p>
          </div>
        ) : (
          <div className="listeners-table">
            {listeners.map(listener => (
              <div key={listener.id} className={`listener-row ${!listener.enabled ? 'disabled' : ''}`}>
                <div className="listener-info">
                  <div className="listener-name">
                    {listener.enabled ? 
                      <Power size={14} className="status-icon enabled" /> : 
                      <PowerOff size={14} className="status-icon disabled" />
                    }
                    {listener.name}
                  </div>
                  <div className="listener-meta">
                    <span className="listener-type">{listener.type}</span>
                    <span className="listener-interval">{formatInterval(listener.interval)}</span>
                    {listener.tags.length > 0 && (
                      <span className="listener-tags">
                        {listener.tags.map(tag => (
                          <span key={tag} className="tag">{tag}</span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                <div className="listener-actions">
                  <button 
                    className="btn-icon" 
                    onClick={() => handleEdit(listener)}
                    title="Edit listener"
                  >
                    <Edit size={14} />
                  </button>
                  <button 
                    className="btn-icon danger" 
                    onClick={() => handleDelete(listener.id)}
                    title="Delete listener"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 