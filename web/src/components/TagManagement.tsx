import { useState, useEffect } from 'react';
import { Plus, Trash2, Tag } from 'lucide-react';
import { EventTag } from '../types';
import { fetchTags, createTag, deleteTag } from '../api';

interface TagManagementProps {
  onClose?: () => void;
}

const predefinedColors = [
  '#1f6feb', '#2ea043', '#f85149', '#fb8500', '#8b5cf6', 
  '#06b6d4', '#84cc16', '#eab308', '#ef4444', '#8b949e'
];

export function TagManagement({ onClose }: TagManagementProps) {
  const [tags, setTags] = useState<EventTag[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    color: predefinedColors[0],
  });

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      setLoading(true);
      const response = await fetchTags();
      setTags(response.tags || []);
    } catch (error) {
      console.error('Failed to load tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTag(formData);
      await loadTags();
      resetForm();
    } catch (error) {
      console.error('Failed to save tag:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this tag?')) {
      try {
        await deleteTag(id);
        await loadTags();
      } catch (error) {
        console.error('Failed to delete tag:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      color: predefinedColors[0],
    });
    setShowForm(false);
  };

  return (
    <div className="tag-management">
      <div className="tag-header">
        <h3>Event Tags</h3>
        <button 
          className="btn btn-primary" 
          onClick={() => setShowForm(true)}
        >
          <Plus size={16} />
          Add Tag
        </button>
      </div>

      {showForm && (
        <div className="tag-form-overlay">
          <div className="tag-form">
            <h4>New Tag</h4>
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
                <label>Color</label>
                <div className="color-picker">
                  {predefinedColors.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`color-option ${formData.color === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData({ ...formData, color })}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="tags-list">
        {loading ? (
          <div className="loading">Loading tags...</div>
        ) : tags.length === 0 ? (
          <div className="empty-state">
            <p>No tags created.</p>
            <p className="hint">Create tags to organize and categorize your events.</p>
          </div>
        ) : (
          <div className="tags-grid">
            {tags.map(tag => (
              <div key={tag.id} className="tag-item">
                <div className="tag-info">
                  <span 
                    className="tag-badge" 
                    style={{ backgroundColor: tag.color }}
                  >
                    <Tag size={12} />
                    {tag.name}
                  </span>
                </div>
                <button 
                  className="btn-icon danger" 
                  onClick={() => handleDelete(tag.id)}
                  title="Delete tag"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 