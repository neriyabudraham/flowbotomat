import { useState, useEffect } from 'react';
import { 
  AlertTriangle, RefreshCw, ChevronLeft, ChevronRight,
  Filter, Search, X
} from 'lucide-react';
import api from '../../services/api';

export default function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [severityFilter, setSeverityFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    loadLogs();
  }, [pagination.page, severityFilter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: 30,
      });
      if (severityFilter) params.append('severity', severityFilter);
      
      const { data } = await api.get(`/admin/logs?${params}`);
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const severityStyles = {
    low: { bg: 'bg-gray-100', text: 'text-gray-700', icon: 'text-gray-500' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: 'text-yellow-500' },
    high: { bg: 'bg-orange-100', text: 'text-orange-700', icon: 'text-orange-500' },
    critical: { bg: 'bg-red-100', text: 'text-red-700', icon: 'text-red-500' },
  };

  const severityLabels = {
    low: 'נמוך',
    medium: 'בינוני',
    high: 'גבוה',
    critical: 'קריטי',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">לוגים ושגיאות</h2>
        <button 
          onClick={loadLogs} 
          className="p-2 hover:bg-gray-100 rounded-lg"
          disabled={loading}
        >
          <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={severityFilter}
          onChange={(e) => {
            setSeverityFilter(e.target.value);
            setPagination(p => ({ ...p, page: 1 }));
          }}
          className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500"
        >
          <option value="">כל הרמות</option>
          <option value="low">נמוך</option>
          <option value="medium">בינוני</option>
          <option value="high">גבוה</option>
          <option value="critical">קריטי</option>
        </select>
      </div>

      {/* Logs List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">טוען...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>אין לוגים להצגה</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {logs.map(log => {
              const style = severityStyles[log.severity] || severityStyles.low;
              
              return (
                <div 
                  key={log.id} 
                  className="p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={`w-5 h-5 mt-0.5 ${style.icon}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{log.error_type}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${style.bg} ${style.text}`}>
                            {severityLabels[log.severity] || log.severity}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-1">
                          {log.error_message}
                        </p>
                        {log.user_email && (
                          <p className="text-xs text-gray-400 mt-1">
                            משתמש: {log.user_email}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('he-IL')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <span className="text-sm text-gray-500">
                {pagination.total} רשומות
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                  disabled={pagination.page <= 1}
                  className="p-1.5 hover:bg-white rounded border border-gray-200 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-600 px-2">
                  {pagination.page} / {pagination.pages}
                </span>
                <button
                  onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                  disabled={pagination.page >= pagination.pages}
                  className="p-1.5 hover:bg-white rounded border border-gray-200 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Log Details Modal */}
      {selectedLog && (
        <LogDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}

function LogDetailsModal({ log, onClose }) {
  const severityStyles = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-semibold">פרטי שגיאה</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">סוג שגיאה</label>
              <div className="font-medium">{log.error_type}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">רמת חומרה</label>
              <div>
                <span className={`px-2 py-0.5 rounded text-sm ${severityStyles[log.severity]}`}>
                  {log.severity}
                </span>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500">תאריך</label>
              <div className="font-medium">{new Date(log.created_at).toLocaleString('he-IL')}</div>
            </div>
            {log.user_email && (
              <div>
                <label className="text-sm text-gray-500">משתמש</label>
                <div className="font-medium">{log.user_email}</div>
              </div>
            )}
          </div>
          
          <div>
            <label className="text-sm text-gray-500">הודעת שגיאה</label>
            <div className="mt-1 p-3 bg-gray-50 rounded-lg text-sm">{log.error_message}</div>
          </div>
          
          {log.stack_trace && (
            <div>
              <label className="text-sm text-gray-500">Stack Trace</label>
              <pre className="mt-1 p-3 bg-gray-900 text-green-400 rounded-lg text-xs overflow-auto max-h-60" dir="ltr">
                {log.stack_trace}
              </pre>
            </div>
          )}
          
          {log.context && (
            <div>
              <label className="text-sm text-gray-500">קונטקסט</label>
              <pre className="mt-1 p-3 bg-gray-50 rounded-lg text-xs overflow-auto" dir="ltr">
                {JSON.stringify(log.context, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
