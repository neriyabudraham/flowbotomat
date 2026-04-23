import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, AlertCircle, Info, CheckCircle, RefreshCw, Activity,
  ChevronDown, ChevronUp, X, Filter, ExternalLink, Loader, Heart, Zap
} from 'lucide-react';
import api from '../../services/api';

// Admin tab — surfaces watchdog alerts + per-connection delivery health.
// Auto-refreshes every 30s.
export default function AdminSystemAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState({ open: 0, high: 0, warning: 0, info: 0 });
  const [health, setHealth] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [severityFilter, setSeverityFilter] = useState('');
  const [running, setRunning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [a, h] = await Promise.all([
        api.get('/admin/system-alerts', { params: { status: statusFilter, severity: severityFilter, limit: 200 } }),
        api.get('/admin/system-alerts/delivery-health'),
      ]);
      setAlerts(a.data.alerts || []);
      setSummary(a.data.summary || { open: 0, high: 0, warning: 0, info: 0 });
      setHealth(h.data.health || []);
      setLastRefresh(Date.now());
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בטעינת התראות');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const handleResolve = async (alertId) => {
    try {
      await api.post(`/admin/system-alerts/${alertId}/resolve`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה');
    }
  };

  const handleRunWatchdog = async () => {
    setRunning(true); setError('');
    try {
      await api.post('/admin/system-alerts/run-watchdog');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהרצת watchdog');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header summary */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-red-500" />
            התראות מערכת ובריאות מסירה
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            התראות מ-Watchdog שרץ כל 60 שניות. רענון אוטומטי כל 30 שניות. רענון אחרון: {new Date(lastRefresh).toLocaleTimeString('he-IL')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunWatchdog} disabled={running}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
          >
            {running ? <><Loader className="w-4 h-4 animate-spin" /> רץ...</> : <><Zap className="w-4 h-4" /> הרץ Watchdog עכשיו</>}
          </button>
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-lg" title="רענן">
            <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Severity counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="פתוחות" value={summary.open} color="gray" icon={<AlertCircle className="w-4 h-4" />} />
        <SummaryCard label="חמורות" value={summary.high} color="red" icon={<AlertTriangle className="w-4 h-4" />} pulse={summary.high > 0} />
        <SummaryCard label="אזהרות" value={summary.warning} color="amber" icon={<AlertCircle className="w-4 h-4" />} />
        <SummaryCard label="מידע" value={summary.info} color="blue" icon={<Info className="w-4 h-4" />} />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> <span>{error}</span>
          <button onClick={() => setError('')} className="mr-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filters + alerts table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
            <option value="open">רק פתוחות</option>
            <option value="resolved">רק טופלו</option>
            <option value="all">הכל</option>
          </select>
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
            <option value="">כל החומרות</option>
            <option value="high">חמורות</option>
            <option value="warning">אזהרות</option>
            <option value="info">מידע</option>
          </select>
          <span className="text-sm text-gray-400 mr-auto">{alerts.length} התראות</span>
        </div>

        {alerts.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-300" />
            <p>אין התראות פתוחות — המערכת בריאה</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {alerts.map(a => <AlertRow key={a.id} alert={a} onResolve={handleResolve} />)}
          </div>
        )}
      </div>

      {/* Per-connection delivery health */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Heart className="w-5 h-5 text-pink-500" />
          <h3 className="font-bold text-gray-900">בריאות מסירה — 24 שעות אחרונות</h3>
          <span className="text-sm text-gray-400">({health.length} חיבורים פעילים)</span>
        </div>
        {health.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">אין נתונים</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-4 py-2.5 text-right">משתמש</th>
                  <th className="px-4 py-2.5 text-right">חיבור</th>
                  <th className="px-4 py-2.5 text-right">סה״כ ג'ובים</th>
                  <th className="px-4 py-2.5 text-right">נשלחו</th>
                  <th className="px-4 py-2.5 text-right">נכשלו</th>
                  <th className="px-4 py-2.5 text-right">timeouts</th>
                  <th className="px-4 py-2.5 text-right">נמענים</th>
                  <th className="px-4 py-2.5 text-right">% מסירה</th>
                  <th className="px-4 py-2.5 text-right">LIDs נשמטו</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {health.map(h => {
                  const ratio = h.total_recipients > 0 ? h.sent_recipients / h.total_recipients : null;
                  const ratioColor =
                    ratio == null ? 'text-gray-400' :
                    ratio >= 0.95 ? 'text-green-600' :
                    ratio >= 0.80 ? 'text-amber-600' : 'text-red-600';
                  return (
                    <tr key={h.connection_id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2 text-gray-900">{h.user_name || h.user_email}</td>
                      <td className="px-4 py-2 text-gray-500" dir="ltr">{h.phone_number || '—'}</td>
                      <td className="px-4 py-2">{h.total_jobs}</td>
                      <td className="px-4 py-2 text-green-700">{h.sent_jobs}</td>
                      <td className={`px-4 py-2 ${h.failed_jobs > 0 ? 'text-red-600 font-medium' : ''}`}>{h.failed_jobs}</td>
                      <td className={`px-4 py-2 ${h.timeout_jobs > 0 ? 'text-amber-600' : ''}`}>{h.timeout_jobs}</td>
                      <td className="px-4 py-2 text-gray-500">
                        {(h.sent_recipients || 0).toLocaleString()} / {(h.total_recipients || 0).toLocaleString()}
                      </td>
                      <td className={`px-4 py-2 font-medium ${ratioColor}`}>
                        {ratio == null ? '—' : `${Math.round(ratio * 100)}%`}
                      </td>
                      <td className={`px-4 py-2 ${h.avg_lid_drop > 100 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {h.avg_lid_drop ? `~${h.avg_lid_drop.toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, icon, pulse }) {
  const colors = {
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]} ${pulse ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium">{icon} {label}</div>
      <div className="text-3xl font-bold mt-1">{(value || 0).toLocaleString()}</div>
    </div>
  );
}

function AlertRow({ alert, onResolve }) {
  const [expanded, setExpanded] = useState(false);
  const sevConfig = {
    high: { cls: 'bg-red-100 text-red-700 border-red-200', label: 'חמור', icon: <AlertTriangle className="w-4 h-4" /> },
    warning: { cls: 'bg-amber-100 text-amber-700 border-amber-200', label: 'אזהרה', icon: <AlertCircle className="w-4 h-4" /> },
    info: { cls: 'bg-blue-100 text-blue-700 border-blue-200', label: 'מידע', icon: <Info className="w-4 h-4" /> },
  };
  const sev = sevConfig[alert.severity] || sevConfig.info;
  const isOpen = alert.status === 'open';

  return (
    <div className={`px-5 py-3 ${isOpen ? '' : 'opacity-50'}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${sev.cls} flex-shrink-0`}>
          {sev.icon} {sev.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900">{alert.title}</p>
          {alert.message && <p className="text-sm text-gray-600 mt-0.5">{alert.message}</p>}
          <div className="text-xs text-gray-400 mt-1 flex items-center gap-3 flex-wrap">
            <span>{new Date(alert.created_at).toLocaleString('he-IL')}</span>
            {alert.user_name && <span>👤 {alert.user_name}</span>}
            {alert.conn_phone && <span dir="ltr">📞 {alert.conn_phone}</span>}
            <span className="text-gray-300">{alert.alert_type}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {alert.payload && (
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 hover:bg-gray-100 rounded">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          {isOpen && (
            <button onClick={() => onResolve(alert.id)}
              className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100">
              סמן כטופל
            </button>
          )}
          {!isOpen && alert.auto_resolved && (
            <span className="text-xs text-green-500">טופל אוטומטית</span>
          )}
        </div>
      </div>
      {expanded && alert.payload && (
        <pre className="mt-2 mr-12 text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 overflow-x-auto text-gray-700">
          {JSON.stringify(alert.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
