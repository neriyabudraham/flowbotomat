import { useState, useEffect } from 'react';
import { Database, Download, Trash2, Plus, RefreshCw, Calendar, HardDrive, CheckCircle, XCircle } from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';
import ConfirmModal from '../organisms/ConfirmModal';

export default function AdminBackups() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [notification, setNotification] = useState(null);

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

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleCreate = async () => {
    setCreating(true);
    setConfirmCreate(false);
    try {
      await api.post('/admin/backups');
      await fetchBackups();
      showNotification('success', 'גיבוי נוצר בהצלחה');
    } catch (err) {
      showNotification('error', err.response?.data?.error || 'שגיאה ביצירת גיבוי');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (filename) => {
    try {
      const response = await api.get(`/admin/backups/${filename}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showNotification('error', 'שגיאה בהורדת גיבוי');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    
    setDeleting(confirmDelete);
    try {
      await api.delete(`/admin/backups/${confirmDelete}`);
      await fetchBackups();
      showNotification('success', 'גיבוי נמחק');
    } catch (err) {
      showNotification('error', 'שגיאה במחיקת גיבוי');
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
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
          <Button onClick={() => setConfirmCreate(true)} disabled={creating}>
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
                        onClick={() => setConfirmDelete(backup.filename)}
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

      {/* Notification */}
      {notification && (
        <div className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 p-4 rounded-xl shadow-lg flex items-center gap-3 z-50 ${
          notification.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Confirm Create Modal */}
      <ConfirmModal
        isOpen={confirmCreate}
        onClose={() => setConfirmCreate(false)}
        onConfirm={handleCreate}
        title="יצירת גיבוי"
        message="האם ליצור גיבוי חדש של מסד הנתונים?"
        confirmText="צור גיבוי"
        cancelText="ביטול"
        variant="info"
        loading={creating}
      />

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="מחיקת גיבוי"
        message={`האם למחוק את הגיבוי ${confirmDelete}?`}
        confirmText="מחק"
        cancelText="ביטול"
        variant="danger"
        loading={!!deleting}
      />
    </div>
  );
}
