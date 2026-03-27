import { useState, useEffect, useCallback } from 'react';
import {
  History, User, Clock, AlertTriangle, CheckCircle2, Loader2, XCircle, RefreshCw,
  Filter, ChevronLeft, Phone, Search, Calendar, X, RotateCcw
} from 'lucide-react';
import api from '../../services/api';
import ExecutionRunDetail from './ExecutionRunDetail';

const STATUS_CONFIG = {
  completed: { label: 'הושלם', color: 'text-green-700 bg-green-50 border-green-200', icon: CheckCircle2, dotColor: 'bg-green-500' },
  running: { label: 'רץ', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: Loader2, dotColor: 'bg-blue-500' },
  error: { label: 'שגיאה', color: 'text-red-700 bg-red-50 border-red-200', icon: XCircle, dotColor: 'bg-red-500' },
  timeout: { label: 'פג תוקף', color: 'text-orange-700 bg-orange-50 border-orange-200', icon: Clock, dotColor: 'bg-orange-500' },
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
  if (!ms && ms !== 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatFullDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
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

  // Search & filters
  const [searchText, setSearchText] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchHistory = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (searchText) params.search = searchText;
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
      if (dateTo) params.date_to = new Date(dateTo + 'T23:59:59').toISOString();
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
  }, [botId, page, statusFilter, searchText, dateFrom, dateTo]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleSearch = () => {
    setSearchText(searchInput);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchText('');
    setSearchInput('');
    setDateFrom('');
    setDateTo('');
    setStatusFilter(null);
    setPage(1);
  };

  const hasActiveFilters = searchText || dateFrom || dateTo || statusFilter;

  // If a run is selected, show run detail
  if (selectedRun) {
    return (
      <ExecutionRunDetail
        botId={botId}
        runId={selectedRun}
        onBack={() => { setSelectedRun(null); fetchHistory(true); }}
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
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { key: null, count: totalRuns, label: 'סה״כ ריצות', color: 'gray', active: !statusFilter },
          { key: 'completed', count: statusCounts.completed || 0, label: 'הושלמו', color: 'green', active: statusFilter === 'completed' },
          { key: 'error', count: statusCounts.error || 0, label: 'שגיאות', color: 'red', active: statusFilter === 'error' },
          { key: 'running', count: statusCounts.running || 0, label: 'בריצה', color: 'blue', active: statusFilter === 'running' },
        ].map(({ key, count, label, color, active }) => (
          <button
            key={key || 'all'}
            onClick={() => { setStatusFilter(statusFilter === key ? null : key); setPage(1); }}
            className={`rounded-xl p-3 text-right transition-all border ${
              active ? `border-${color}-300 bg-${color}-50 shadow-sm ring-1 ring-${color}-200` : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
            }`}
          >
            <div className={`text-2xl font-bold ${active ? `text-${color}-700` : 'text-gray-700'}`}>{count}</div>
            <div className={`text-xs ${active ? `text-${color}-600` : 'text-gray-500'}`}>{label}</div>
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="חיפוש בתוך הריצות... (טקסט, שם, טלפון, משתנים)"
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2.5 bg-teal-500 text-white rounded-xl text-sm font-medium hover:bg-teal-600 transition-colors"
        >
          חפש
        </button>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2.5 rounded-xl border transition-colors ${showFilters ? 'bg-teal-50 border-teal-200 text-teal-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
        >
          <Filter className="w-4 h-4" />
        </button>
        <button
          onClick={() => fetchHistory(true)}
          disabled={refreshing}
          className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Date range filters */}
      {showFilters && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-500">מתאריך:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-teal-200 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">עד תאריך:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-teal-200 outline-none"
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            >
              <X className="w-3 h-3" />
              נקה סינון
            </button>
          )}
        </div>
      )}

      {/* Active filters badge */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">מסננים פעילים:</span>
          {searchText && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-teal-50 text-teal-700 rounded-lg border border-teal-200">
              <Search className="w-3 h-3" />
              "{searchText}"
              <button onClick={() => { setSearchText(''); setSearchInput(''); setPage(1); }}><X className="w-3 h-3" /></button>
            </span>
          )}
          {statusFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded-lg border border-purple-200">
              {STATUS_CONFIG[statusFilter]?.label}
              <button onClick={() => { setStatusFilter(null); setPage(1); }}><X className="w-3 h-3" /></button>
            </span>
          )}
          {dateFrom && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
              מ-{dateFrom}
              <button onClick={() => { setDateFrom(''); setPage(1); }}><X className="w-3 h-3" /></button>
            </span>
          )}
          {dateTo && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
              עד {dateTo}
              <button onClick={() => { setDateTo(''); setPage(1); }}><X className="w-3 h-3" /></button>
            </span>
          )}
        </div>
      )}

      {/* Results count */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{total} תוצאות</span>
      </div>

      {/* Runs list */}
      {runs.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <History className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-600 mb-2">
            {hasActiveFilters ? 'לא נמצאו תוצאות' : 'אין היסטוריית ריצות'}
          </h3>
          <p className="text-sm text-gray-400">
            {hasActiveFilters ? 'נסה לשנות את הסינון' : 'כשהבוט ירוץ, הריצות יופיעו כאן עם כל הפרטים'}
          </p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="mt-3 text-sm text-teal-600 hover:underline">
              נקה סינון
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {runs.map((run) => {
            const config = STATUS_CONFIG[run.status] || STATUS_CONFIG.completed;
            return (
              <button
                key={run.id}
                onClick={() => setSelectedRun(run.id)}
                className="w-full text-right bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all p-4 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Status indicator */}
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
                          {run.contact_name || 'ללא שם'}
                        </span>
                        {run.contact_phone && (
                          <span className="text-xs text-gray-400 font-mono flex items-center gap-1 flex-shrink-0" dir="ltr">
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
                        <span className="font-mono">{formatDuration(run.duration_ms)}</span>
                        <span>{run.step_count} צעדים</span>
                        {parseInt(run.error_step_count) > 0 && (
                          <span className="text-red-500 flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            {run.error_step_count} שגיאות
                          </span>
                        )}
                      </div>

                      {run.error_message && (
                        <div className="mt-1 text-xs text-red-500 truncate max-w-lg">
                          <XCircle className="w-3 h-3 inline ml-1" />
                          {run.error_message}
                        </div>
                      )}

                      {run.trigger_message && typeof run.trigger_message === 'string' && (
                        <div className="mt-1 text-xs text-gray-400 truncate max-w-lg">
                          "{run.trigger_message.substring(0, 80)}"
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
            );
          })}
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
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) pageNum = i + 1;
              else if (page <= 3) pageNum = i + 1;
              else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = page - 2 + i;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 text-sm rounded-lg ${page === pageNum ? 'bg-teal-500 text-white' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
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
