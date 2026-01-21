import { useState, useEffect } from 'react';
import { Database, Download, Trash2, Plus, RefreshCw, Calendar, HardDrive } from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';

export default function AdminBackups() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const fetchBackups = async () => {
    try {
      const { data } = await api.get('/admin/backups');
      setBackups(data.backups || []);
    } catch (err) {
      console.error('Failed to load backups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreate = async () => {
    if (!confirm('ליצור גיבוי חדש?')) return;
    
    setCreating(true);
    try {
      await api.post('/admin/backups');
      await fetchBackups();
      alert('גיבוי נוצר בהצלחה');
    } catch (err) {
      alert('שגיאה ביצירת גיבוי');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = (filename) => {
    window.open(`${api.defaults.baseURL}/admin/backups/${filename}`, '_blank');
  };

  const handleDelete = async (filename) => {
    if (!confirm(`למחוק את הגיבוי ${filename}?`)) return;
    
    setDeleting(filename);
    try {
      await api.delete(`/admin/backups/${filename}`);
      await fetchBackups();
    } catch (err) {
      alert('שגיאה במחיקת גיבוי');
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-800">גיבויים</h2>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            onClick={fetchBackups}
            className="!p-2"
            title="רענן"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? (
              <RefreshCw className="w-4 h-4 animate-spin ml-2" />
            ) : (
              <Plus className="w-4 h-4 ml-2" />
            )}
            צור גיבוי
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-700">
          <strong>גיבוי אוטומטי:</strong> המערכת מבצעת גיבוי אוטומטי כל יום בשעה 03:00. 
          גיבויים נשמרים ל-7 ימים.
        </p>
      </div>

      {/* Backups List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">טוען...</div>
      ) : backups.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Database className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-gray-700 font-medium mb-1">אין גיבויים</h3>
          <p className="text-gray-500 text-sm">לחץ על "צור גיבוי" ליצירת גיבוי ראשון</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">קובץ</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">גודל</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">תאריך</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {backups.map((backup) => (
                <tr key={backup.filename} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-mono text-gray-700">{backup.filename}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{backup.sizeFormatted}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Calendar className="w-3 h-3" />
                      {formatDate(backup.created_at)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownload(backup.filename)}
                        className="p-1.5 hover:bg-blue-50 rounded text-blue-600"
                        title="הורד"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(backup.filename)}
                        disabled={deleting === backup.filename}
                        className="p-1.5 hover:bg-red-50 rounded text-red-600 disabled:opacity-50"
                        title="מחק"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
