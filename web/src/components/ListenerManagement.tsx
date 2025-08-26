import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Power, PowerOff, X } from 'lucide-react';
import { EventListener, SourceType, EventTag } from '../types';
import { fetchListeners, createListener, updateListener, deleteListener, fetchTags } from '../api';

// Constants
const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'rss', label: 'RSS Feed' },
  { value: 'github', label: 'GitHub Repository' },
  { value: 'weather', label: 'Weather API' },
  { value: 'jobs', label: 'Job Listings' },
];

const CONFIG_TEMPLATES: Record<SourceType, Record<string, any>> = {
  rss: { url: "" },
  github: { owner: "", repository: "" },
  weather: { city: "" },
  jobs: { company_url: "", keywords: [], location: "" }
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  url: "https://example.com/feed.xml",
  owner: "Repository owner",
  repository: "Repository name", 
  city: "City name",
  company_url: "Company careers URL",
  keywords: "software, engineer, developer",
  location: "Job location"
};

const MINUTES_TO_NANOSECONDS = 60000000000;
const DEFAULT_INTERVAL_MINUTES = 15;

// Utility functions
const formatInterval = (intervalNs: number): string => {
  const seconds = intervalNs / 1000000000;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
};

const formatIntervalForSelect = (intervalNs: number): string => {
  const seconds = intervalNs / 1000000000;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(seconds / 3600);
  
  if (hours >= 24) return '24h';
  if (hours >= 12) return '12h';
  if (hours >= 6) return '6h';
  if (hours >= 4) return '4h';
  if (hours >= 2) return '2h';
  if (hours >= 1) return '1h';
  if (minutes >= 30) return '30m';
  if (minutes >= 15) return '15m';
  if (minutes >= 10) return '10m';
  return '5m'; // Default fallback
};

const parseIntervalFromSelect = (value: string): number => {
  const intervals: Record<string, number> = {
    '5m': 5 * MINUTES_TO_NANOSECONDS,
    '10m': 10 * MINUTES_TO_NANOSECONDS,
    '15m': 15 * MINUTES_TO_NANOSECONDS,
    '30m': 30 * MINUTES_TO_NANOSECONDS,
    '1h': 60 * MINUTES_TO_NANOSECONDS,
    '2h': 120 * MINUTES_TO_NANOSECONDS,
    '4h': 240 * MINUTES_TO_NANOSECONDS,
    '6h': 360 * MINUTES_TO_NANOSECONDS,
    '12h': 720 * MINUTES_TO_NANOSECONDS,
    '24h': 1440 * MINUTES_TO_NANOSECONDS,
  };
  return intervals[value] || 15 * MINUTES_TO_NANOSECONDS;
};

const validateConfig = (type: SourceType, config: any): string[] => {
  const errors: string[] = [];
  const validators = {
    rss: () => {
      if (!config.url?.trim()) errors.push('RSS URL is required');
      else if (!config.url.startsWith('http')) errors.push('RSS URL must start with http:// or https://');
    },
    github: () => {
      if (!config.owner?.trim()) errors.push('GitHub owner is required');
      if (!config.repository?.trim()) errors.push('GitHub repository is required');
    },
    weather: () => {
      if (!config.city?.trim()) errors.push('City name is required');
    },
    jobs: () => {
      if (!config.company_url?.trim()) errors.push('Company URL is required');
      if (!config.location?.trim()) errors.push('Location is required');
    }
  };
  
  validators[type]?.();
  return errors;
};

// Component
export function ListenerManagement() {
  const [listeners, setListeners] = useState<EventListener[]>([]);
  const [availableTags, setAvailableTags] = useState<EventTag[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingListener, setEditingListener] = useState<EventListener | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(createDefaultFormData());

  function createDefaultFormData() {
    const defaultType = 'rss' as SourceType;
    return {
      name: '',
      type: defaultType,
      enabled: true,
      config: { ...CONFIG_TEMPLATES[defaultType] },
      tags: [] as string[],
      interval: DEFAULT_INTERVAL_MINUTES * MINUTES_TO_NANOSECONDS,
    };
  }

  // Data loading
  useEffect(() => {
    Promise.all([loadListeners(), loadTags()]);
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

  const loadTags = async () => {
    try {
      const response = await fetchTags();
      setAvailableTags(response.tags || []);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  // Form handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const configErrors = validateConfig(formData.type, formData.config);
    if (configErrors.length > 0) {
      alert('Configuration errors:\n' + configErrors.join('\n'));
      return;
    }
    
    if (!formData.name.trim()) {
      alert('Please enter a listener name.');
      return;
    }
    
    try {
      if (editingListener) {
        await updateListener(editingListener.id, { ...formData, id: editingListener.id });
      } else {
        await createListener(formData);
      }
      await loadListeners();
      resetForm();
      alert('Listener saved successfully! Worker has been started and should begin fetching events.');
    } catch (error) {
      console.error('Failed to save listener:', error);
      alert(`Failed to save listener: ${error.message}`);
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

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this listener?')) return;
    
    try {
      await deleteListener(id);
      await loadListeners();
    } catch (error) {
      console.error('Failed to delete listener:', error);
    }
  };

  const resetForm = () => {
    setEditingListener(null);
    setFormData(createDefaultFormData());
    setShowForm(false);
  };

  const handleTypeChange = (newType: SourceType) => {
    setFormData({
      ...formData,
      type: newType,
      config: { ...CONFIG_TEMPLATES[newType] }
    });
  };

  const updateFormField = (field: keyof typeof formData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateConfigField = (fieldName: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      config: { ...prev.config, [fieldName]: value }
    }));
  };

  // Render functions
  const renderConfigField = (fieldName: string) => {
    const value = (formData.config as any)[fieldName] || '';
    const placeholder = FIELD_PLACEHOLDERS[fieldName] || '';

    if (fieldName === 'keywords') {
      return (
        <input
          type="text"
          value={Array.isArray(value) ? value.join(', ') : ''}
          onChange={(e) => {
            const keywords = e.target.value.split(',').map(k => k.trim()).filter(k => k);
            updateConfigField(fieldName, keywords);
          }}
          placeholder={placeholder}
        />
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(e) => updateConfigField(fieldName, e.target.value)}
        placeholder={placeholder}
      />
    );
  };

  const renderConfigFields = () => {
    const fields = Object.keys(CONFIG_TEMPLATES[formData.type]);
    
    if (fields.length === 0) {
      return <p className="no-config">No configuration required for this source type.</p>;
    }

    return (
      <div className="config-fields">
        {fields.map(fieldName => (
          <div key={fieldName} className="config-field">
            <label htmlFor={fieldName}>{fieldName}</label>
            {renderConfigField(fieldName)}
          </div>
        ))}
      </div>
    );
  };

  const renderTagSelection = () => (
    <div className="tag-selection">
      <div className="selected-tags">
        {formData.tags.map(tagName => {
          const tag = availableTags.find(t => t.name === tagName);
          return (
            <span 
              key={tagName} 
              className="selected-tag" 
              style={{ backgroundColor: tag?.color || '#7d8590' }}
            >
              {tagName}
              <button
                type="button"
                onClick={() => updateFormField('tags', formData.tags.filter(t => t !== tagName))}
                className="remove-tag"
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
      </div>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value && !formData.tags.includes(e.target.value)) {
            updateFormField('tags', [...formData.tags, e.target.value]);
          }
        }}
      >
        <option value="">Select a tag...</option>
        {availableTags
          .filter(tag => !formData.tags.includes(tag.name))
          .map(tag => (
            <option key={tag.id} value={tag.name}>{tag.name}</option>
          ))}
      </select>
    </div>
  );

  const renderListenerRow = (listener: EventListener) => (
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
  );

  return (
    <div className="listener-management">
      <div className="listener-header">
        <h3>Event Listeners</h3>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
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
                  onChange={(e) => updateFormField('name', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => handleTypeChange(e.target.value as SourceType)}
                  disabled={!!editingListener}
                >
                  {SOURCE_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {editingListener && <small className="form-hint">Type cannot be changed when editing</small>}
              </div>

              <div className="form-group">
                <label>Interval</label>
                <select
                  value={formatIntervalForSelect(formData.interval)}
                  onChange={(e) => updateFormField('interval', parseIntervalFromSelect(e.target.value))}
                >
                  <option value="5m">5 minutes (RSS/GitHub only)</option>
                  <option value="10m">10 minutes (RSS/GitHub only)</option>
                  <option value="15m">15 minutes (Safe for most APIs)</option>
                  <option value="30m">30 minutes</option>
                  <option value="1h">1 hour (Recommended for Weather)</option>
                  <option value="2h">2 hours</option>
                  <option value="4h">4 hours (Recommended for Jobs)</option>
                  <option value="6h">6 hours</option>
                  <option value="12h">12 hours</option>
                  <option value="24h">24 hours</option>
                </select>
                <small className="form-hint">How often to check for new events</small>
              </div>

              <div className="form-group">
                <label>Configuration</label>
                {renderConfigFields()}
                <details className="raw-config-editor">
                  <summary>Advanced: Edit Raw JSON</summary>
                  <textarea
                    value={JSON.stringify(formData.config, null, 2)}
                    onChange={(e) => {
                      try {
                        updateFormField('config', JSON.parse(e.target.value));
                      } catch (error) {
                        console.warn('Invalid JSON, ignoring change:', error);
                      }
                    }}
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                  />
                </details>
              </div>

              <div className="form-group">
                <label>Tags</label>
                {renderTagSelection()}
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => updateFormField('enabled', e.target.checked)}
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
            {listeners.map(renderListenerRow)}
          </div>
        )}
      </div>
    </div>
  );
}