import { useState, useEffect, useCallback } from 'react';
import { History, User, Clock, AlertTriangle, CheckCircle2, Loader2, XCircle, RefreshCw, Filter, ChevronLeft, Pause, Phone } from 'lucide-react';
import api from '../../services/api';
import ExecutionRunDetail from './ExecutionRunDetail';

const STATUS_CONFIG = {
  completed: { label: 'הושלם', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle2 },
  running: { label: 'רץ', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: Loader2 },
  error: { label: 'שגיאה', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
  timeout: { label: 'פג תוקף', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: Clock },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.completed;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${config.color}`}>
      <Icon className={`w-3.5 h-3.5 ${status === 'running' ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  );
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function BotExecutionHistory({ botId, onNavigateToEditor }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});
  const [statusFilter, setStatusFilter] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);

  const fetchHistory = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get(`/bots/${botId}/history`, { params });
      setRuns(data.runs);
      setTotalPages(data.totalPages);
      setTotal(data.total);
      setStatusCounts(data.statusCounts || {});
    } catch (err) {
      console.error('Failed to load execution history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [botId, page, statusFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // If a run is selected, show run detail
  if (selectedRun) {
    return (
      <ExecutionRunDetail
        botId={botId}
        runId={selectedRun}
        onBack={() => setSelectedRun(null)}
        onNavigateToEditor={onNavigateToEditor}
      />
    );
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl" />
        ))}
      </div>
    );
  }

  const totalRuns = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => { setStatusFilter(null); setPage(1); }}
          className={`rounded-xl p-3 text-right transition-all border ${!statusFilter ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'}`}
        >
          <div className="text-2xl font-bold text-gray-800">{totalRuns}</div>
          <div className="text-xs text-gray-500">סה״כ ריצות</div>
        </button>
        <button
          onClick={() => { setStatusFilter(statusFilter === 'completed' ? null : 'completed'); setPage(1); }}
          className={`rounded-xl p-3 text-right transition-all border ${statusFilter === 'completed' ? 'border-green-300 bg-green-50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'}`}
        >
          <div className="text-2xl font-bold text-green-600">{statusCounts.completed || 0}</div>
          <div className="text-xs text-green-600">הושלמו</div>
        </button>
        <button
          onClick={() => { setStatusFilter(statusFilter === 'error' ? null : 'error'); setPage(1); }}
          className={`rounded-xl p-3 text-right transition-all border ${statusFilter === 'error' ? 'border-red-300 bg-red-50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'}`}
        >
          <div className="text-2xl font-bold text-red-600">{statusCounts.error || 0}</div>
          <div className="text-xs text-red-600">שגיאות</div>
        </button>
        <button
          onClick={() => { setStatusFilter(statusFilter === 'running' ? null : 'running'); setPage(1); }}
          className={`rounded-xl p-3 text-right transition-all border ${statusFilter === 'running' ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'}`}
        >
          <div className="text-2xl font-bold text-blue-600">{statusCounts.running || 0}</div>
          <div className="text-xs text-blue-600">בריצה</div>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <History className="w-4 h-4" />
          <span>{total} ריצות</span>
          {statusFilter && (
            <button
              onClick={() => { setStatusFilter(null); setPage(1); }}
              className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-200"
            >
              <Filter className="w-3 h-3" />
              {STATUS_CONFIG[statusFilter]?.label}
              <XCircle className="w-3 h-3" />
            </button>
          )}
        </div>
        <button
          onClick={() => fetchHistory(true)}
          disabled={refreshing}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Runs list */}
      {runs.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <History className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-600 mb-2">אין היסטוריית ריצות</h3>
          <p className="text-sm text-gray-400">כשהבוט ירוץ, הריצות יופיעו כאן עם כל הפרטים</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setSelectedRun(run.id)}
              className="w-full text-right bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all p-4 group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Contact avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    run.status === 'error' ? 'bg-red-100' : run.status === 'running' ? 'bg-blue-100' : 'bg-teal-100'
                  }`}>
                    <User className={`w-5 h-5 ${
                      run.status === 'error' ? 'text-red-600' : run.status === 'running' ? 'text-blue-600' : 'text-teal-600'
                    }`} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-gray-800 truncate">
                        {run.contact_name || run.contact_phone || 'לא ידוע'}
                      </span>
                      {run.contact_phone && (
                        <span className="text-xs text-gray-400 font-mono flex items-center gap-1 flex-shrink-0">
                          <Phone className="w-3 h-3" />
                          {run.contact_phone.replace('@s.whatsapp.net', '').replace('@c.us', '')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(run.started_at)}
                      </span>
                      <span>{formatDuration(run.duration_ms)}</span>
                      <span>{run.step_count} צעדים</span>
                    </div>

                    {run.error_message && (
                      <div className="mt-1 text-xs text-red-500 truncate max-w-md">
                        {run.error_message}
                      </div>
                    )}

                    {run.trigger_message && (
                      <div className="mt-1 text-xs text-gray-400 truncate max-w-md">
                        הודעה: "{typeof run.trigger_message === 'string' ? run.trigger_message.substring(0, 60) : ''}"
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 mr-3">
                  <StatusBadge status={run.status} />
                  <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            הקודם
          </button>
          <span className="text-sm text-gray-500">
            עמוד {page} מתוך {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            הבא
          </button>
        </div>
      )}
    </div>
  );
}
