import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Power, PowerOff, X } from 'lucide-react';
import { EventListener, SourceType, EventTag } from '../types';
import { fetchListeners, createListener, updateListener, deleteListener, fetchTags } from '../api';

interface ListenerManagementProps {
  onClose?: () => void;
}

const sourceTypeOptions: { value: SourceType; label: string }[] = [
  { value: 'rss', label: 'RSS Feed' },
  { value: 'github', label: 'GitHub Repository' },
  { value: 'weather', label: 'Weather API' },
  { value: 'jobs', label: 'Job Listings' },
];

// Configuration templates for each source type
const configTemplates: Record<SourceType, object> = {
  rss: {
    url: ""
  },
  github: {
    owner: "",
    repository: ""
  },
  weather: {
    city: ""
  },
  jobs: {
    company_url: "",
    keywords: [],
    location: ""
  }
};

// Help text for each configuration field
const configHelp: Record<SourceType, { description: string; fields: Record<string, string> }> = {
  rss: {
    description: "RSS feed configuration for aggregating articles and posts",
    fields: {
      url: "RSS feed URL (e.g., https://example.com/feed.xml)"
    }
  },
  github: {
    description: "GitHub repository monitoring for commits, issues, and releases",
    fields: {
      owner: "Repository owner username or organization",
      repository: "Repository name"
    }
  },
  weather: {
    description: "Weather API integration for location-based weather updates",
    fields: {
      city: "City name for weather monitoring"
    }
  },
  jobs: {
    description: "Job listing aggregation from company career pages",
    fields: {
      company_url: "Company careers API or RSS feed URL",
      keywords: "Array of keywords to filter jobs (e.g., ['software', 'engineer'])",
      location: "Job location filter"
    }
  }
};

export function ListenerManagement({ onClose }: ListenerManagementProps) {
  const [listeners, setListeners] = useState<EventListener[]>([]);
  const [availableTags, setAvailableTags] = useState<EventTag[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingListener, setEditingListener] = useState<EventListener | null>(null);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    type: 'rss' as SourceType,
    enabled: true,
    config: configTemplates['rss'],
    tags: [] as string[],
    interval: 900000000000, // 15 minutes in nanoseconds
  });

  useEffect(() => {
    loadListeners();
    loadTags();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('Submitting form with data:', formData);
    
    // Validate configuration
    const configErrors = validateConfig(formData.type, formData.config);
    if (configErrors.length > 0) {
      alert('Configuration errors:\n' + configErrors.join('\n'));
      return;
    }
    
    // Basic validation
    if (!formData.name.trim()) {
      alert('Please enter a listener name.');
      return;
    }
    
    try {
      if (editingListener) {
        console.log('Updating listener:', editingListener.id, formData);
        await updateListener(editingListener.id, { ...formData, id: editingListener.id });
      } else {
        console.log('Creating new listener:', formData);
        await createListener(formData);
      }
      await loadListeners();
      resetForm();
      alert(`Listener ${editingListener ? 'updated' : 'created'} successfully!`);
    } catch (error) {
      console.error('Failed to save listener:', error);
      alert('Failed to save listener. Please check the console for details.');
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
    const defaultType = 'rss' as SourceType;
    setEditingListener(null);
    setFormData({
      name: '',
      type: defaultType,
      enabled: true,
      config: { ...configTemplates[defaultType] },
      tags: [],
      interval: 900000000000,
    });
    setShowForm(false);
  };

  const handleTypeChange = (newType: SourceType) => {
    setFormData({
      ...formData,
      type: newType,
      config: { ...configTemplates[newType] }
    });
  };

  const validateConfig = (type: SourceType, config: any): string[] => {
    const errors: string[] = [];
    
    switch (type) {
      case 'rss':
        if (!config.url || !config.url.trim()) {
          errors.push('RSS URL is required');
        } else if (!config.url.startsWith('http')) {
          errors.push('RSS URL must start with http:// or https://');
        }
        break;
      case 'github':
        if (!config.owner || !config.owner.trim()) {
          errors.push('GitHub owner is required');
        }
        if (!config.repository || !config.repository.trim()) {
          errors.push('GitHub repository is required');
        }
        break;
      case 'weather':
        if (!config.city || !config.city.trim()) {
          errors.push('City name is required');
        }
        break;
      case 'jobs':
        if (!config.company_url || !config.company_url.trim()) {
          errors.push('Company URL is required');
        }
        if (!config.location || !config.location.trim()) {
          errors.push('Location is required');
        }
        break;
    }
    
    return errors;
  };

  const formatInterval = (intervalNs: number) => {
    const seconds = intervalNs / 1000000000;
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  const renderConfigFields = () => {
    const { type, config } = formData;
    const fields = configHelp[type].fields;

    console.log('Rendering config fields:', { type, config, fields });

    if (!fields || Object.keys(fields).length === 0) {
      return (
        <div className="config-fields">
          <p className="no-config">No configuration fields required for this source type.</p>
        </div>
      );
    }

    return (
      <div className="config-fields">
        {Object.entries(fields).map(([fieldName, helpText]) => (
          <div key={fieldName} className="config-field">
            <label htmlFor={fieldName}>{fieldName}</label>
            {fieldName === 'keywords' ? (
              <input
                type="text"
                id={fieldName}
                value={Array.isArray((config as any)[fieldName]) ? (config as any)[fieldName].join(', ') : ''}
                onChange={(e) => {
                  const keywords = e.target.value.split(',').map(k => k.trim()).filter(k => k);
                  console.log('Updating keywords:', { keywords, fieldName });
                  setFormData({
                    ...formData,
                    config: { ...config, [fieldName]: keywords }
                  });
                }}
                placeholder="Enter keywords separated by commas"
              />
            ) : (
              <input
                type="text"
                id={fieldName}
                value={(config as any)[fieldName] || ''}
                onChange={(e) => {
                  console.log('Updating config field:', { fieldName, value: e.target.value, config });
                  setFormData({
                    ...formData,
                    config: { ...config, [fieldName]: e.target.value }
                  });
                }}
                placeholder={helpText}
              />
            )}
          </div>
        ))}
      </div>
    );
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
                  onChange={(e) => handleTypeChange(e.target.value as SourceType)}
                  disabled={!!editingListener}
                >
                  {sourceTypeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {!!editingListener && <small className="form-hint">Type cannot be changed when editing</small>}
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
                <label>Configuration</label>
                {renderConfigFields()}
                <details className="raw-config-editor">
                  <summary>Advanced: Edit Raw JSON</summary>
                  <textarea
                    value={JSON.stringify(formData.config, null, 2)}
                    onChange={(e) => {
                      try {
                        const newConfig = JSON.parse(e.target.value);
                        console.log('Updating config via JSON:', newConfig);
                        setFormData({ ...formData, config: newConfig });
                      } catch (error) {
                        console.warn('Invalid JSON, ignoring change:', error);
                      }
                    }}
                    rows={6}
                    placeholder='{"url": "https://example.com/feed"}'
                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                  />
                </details>
              </div>

              <div className="form-group">
                <label>Tags</label>
                <div className="tag-selection">
                  <div className="selected-tags">
                    {formData.tags.map(tagName => {
                      const tag = availableTags.find(t => t.name === tagName);
                      return (
                        <span key={tagName} className="selected-tag" style={{ backgroundColor: tag?.color || '#7d8590' }}>
                          {tagName}
                          <button
                            type="button"
                            onClick={() => setFormData({
                              ...formData,
                              tags: formData.tags.filter(t => t !== tagName)
                            })}
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
                        setFormData({
                          ...formData,
                          tags: [...formData.tags, e.target.value]
                        });
                      }
                    }}
                  >
                    <option value="">Select a tag...</option>
                    {availableTags
                      .filter(tag => !formData.tags.includes(tag.name))
                      .map(tag => (
                        <option key={tag.id} value={tag.name}>
                          {tag.name}
                        </option>
                      ))}
                  </select>
                </div>
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