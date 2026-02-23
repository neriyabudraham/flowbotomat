import { useState, useEffect, useMemo } from 'react';
import {
  History, Clock, CheckCircle, XCircle, AlertTriangle, Trash2,
  Image as ImageIcon, Video, Mic, FileText, ChevronDown, ChevronUp,
  User, Users, Phone, Send, Loader2, Eye, RefreshCw, TrendingUp,
  BarChart3, X, Globe, RotateCcw, AlertCircle
} from 'lucide-react';
import api from '../../services/api';

export default function TransferJobHistoryTab() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState(null);
  const [selectedSender, setSelectedSender] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [retrying, setRetrying] = useState(null);
  const [resuming, setResuming] = useState(null);
  const [expandedErrors, setExpandedErrors] = useState({});
  const limit = 20;

  useEffect(() => {
    fetchHistory();
  }, [offset]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/group-transfers/jobs/history', {
        params: { limit, offset }
      });
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
      setStats(data.stats || null);
    } catch (e) {
      console.error('Failed to fetch history:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (job, e) => {
    e.stopPropagation();
    setDeleteConfirm(job);
  };

  const handleRetryFailed = async (job, e) => {
    e.stopPropagation();
    try {
      setRetrying(job.id);
      setErrorMessage(null);
      const { data } = await api.post(`/group-transfers/jobs/${job.id}/retry-failed`);
      if (data.success) {
        setErrorMessage({ type: 'success', text: `שולח מחדש ל-${data.failedCount} קבוצות שנכשלו` });
        fetchHistory();
      }
    } catch (e) {
      setErrorMessage({ type: 'error', text: e.response?.data?.error || 'שגיאה בשליחה מחדש' });
    } finally {
      setRetrying(null);
    }
  };

  const handleResume = async (job, e) => {
    e.stopPropagation();
    try {
      setResuming(job.id);
      setErrorMessage(null);
      const { data } = await api.post(`/group-transfers/jobs/${job.id}/resume`);
      if (data.success) {
        setErrorMessage({ type: 'success', text: data.message || `ממשיך לשלוח ל-${data.pendingCount} קבוצות` });
        fetchHistory();
      }
    } catch (e) {
      setErrorMessage({ type: 'error', text: e.response?.data?.error || 'שגיאה בהמשכת המשימה' });
    } finally {
      setResuming(null);
    }
  };

  const toggleErrorExpand = (msgId, e) => {
    e.stopPropagation();
    setExpandedErrors(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    const jobId = deleteConfirm.id;
    const isStuckJob = ['sending', 'pending', 'confirmed'].includes(deleteConfirm.status);
    
    try {
      setDeleting(jobId);
      await api.delete(`/group-transfers/jobs/${jobId}${isStuckJob ? '?force=true' : ''}`);
      setJobs(jobs.filter(j => j.id !== jobId));
      setTotal(t => t - 1);
      if (expandedJob === jobId) setExpandedJob(null);
      setDeleteConfirm(null);
    } catch (e) {
      console.error('Failed to delete job:', e);
      setErrorMessage({ type: 'error', text: e.response?.data?.error || 'שגיאה במחיקת האירוע' });
      setDeleteConfirm(null);
    } finally {
      setDeleting(null);
    }
  };

  const formatPhone = (phone) => {
    if (!phone) return phone;
    if (phone === 'website') return 'דרך האתר';
    let display = phone;
    if (display.includes('@')) {
      display = display.split('@')[0];
    }
    if (display.startsWith('972')) {
      display = '0' + display.substring(3);
    }
    if (display.length === 10 && display.startsWith('0')) {
      return `${display.slice(0, 3)}-${display.slice(3, 6)}-${display.slice(6)}`;
    }
    return display;
  };

  const calculatedStats = useMemo(() => {
    if (stats) return stats;
    if (jobs.length === 0) return null;
    
    let totalSent = 0;
    let totalFailed = 0;
    let totalTargets = 0;
    let totalAttempted = 0;
    const senderStats = {};
    
    jobs.forEach(job => {
      const sent = job.sent_count || 0;
      const failed = job.failed_count || 0;
      const targets = job.target_count || 0;
      
      totalSent += sent;
      totalFailed += failed;
      totalTargets += targets;
      
      const wasCancelledOrStopped = ['cancelled', 'stopped', 'pending'].includes(job.status);
      if (wasCancelledOrStopped) {
        totalAttempted += sent + failed;
      } else {
        totalAttempted += targets;
      }
      
      const senderKey = job.sender_phone || 'unknown';
      const senderName = job.sender_name || formatPhone(job.sender_phone) || 'לא ידוע';
      if (!senderStats[senderKey]) {
        senderStats[senderKey] = { 
          name: senderName, 
          phone: job.sender_phone,
          sent: 0, 
          failed: 0,
          jobs: 0,
          targets: 0,
          attempted: 0
        };
      }
      senderStats[senderKey].sent += sent;
      senderStats[senderKey].failed += failed;
      senderStats[senderKey].jobs += 1;
      senderStats[senderKey].targets += targets;
      senderStats[senderKey].attempted += wasCancelledOrStopped ? (sent + failed) : targets;
    });
    
    const successRate = totalAttempted > 0 ? Math.round((totalSent / totalAttempted) * 100) : 0;
    
    return {
      totalJobs: total,
      totalSent,
      totalFailed,
      totalTargets,
      totalAttempted,
      successRate,
      senders: Object.entries(senderStats)
        .map(([key, data]) => ({ key, ...data }))
        .sort((a, b) => b.sent - a.sent)
    };
  }, [jobs, stats, total]);

  const selectedSenderStats = useMemo(() => {
    if (!selectedSender || !calculatedStats?.senders) return null;
    return calculatedStats.senders.find(s => s.key === selectedSender);
  }, [selectedSender, calculatedStats]);

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      completed: 'bg-green-100 text-green-700',
      partial: 'bg-yellow-100 text-yellow-700',
      stopped: 'bg-orange-100 text-orange-700',
      cancelled: 'bg-gray-100 text-gray-700',
      error: 'bg-red-100 text-red-700',
      sending: 'bg-teal-100 text-teal-700',
      pending: 'bg-cyan-100 text-cyan-700',
      confirmed: 'bg-indigo-100 text-indigo-700',
    };
    const labels = {
      completed: 'הושלם',
      partial: 'הושלם חלקית',
      stopped: 'נעצר',
      cancelled: 'בוטל',
      error: 'שגיאה',
      sending: 'בשליחה',
      pending: 'ממתין לאישור',
      confirmed: 'אושר',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getMessageTypeIcon = (type) => {
    switch (type) {
      case 'image': return <ImageIcon className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      case 'audio': return <Mic className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getMessageTypeLabel = (type) => {
    switch (type) {
      case 'image': return 'תמונה';
      case 'video': return 'סרטון';
      case 'audio': return 'הקלטה';
      default: return 'טקסט';
    }
  };

  if (loading && jobs.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center">
          <History className="w-10 h-10 text-gray-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">אין היסטוריית שליחות</h3>
        <p className="text-gray-600">שליחות שתבצע יופיעו כאן</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {calculatedStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl p-4 border border-teal-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl flex items-center justify-center shadow">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{calculatedStats.totalJobs}</p>
                <p className="text-xs text-gray-500">סה״כ שליחות</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{calculatedStats.successRate}%</p>
                <p className="text-xs text-gray-500">אחוז הצלחה</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{calculatedStats.totalSent}</p>
                <p className="text-xs text-gray-500">הודעות נשלחו</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl p-4 border border-red-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center shadow">
                <XCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{calculatedStats.totalFailed}</p>
                <p className="text-xs text-gray-500">נכשלו</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-colors border border-gray-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          רענן
        </button>
      </div>

      {/* Jobs list */}
      <div className="space-y-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            <div
              className="p-4 cursor-pointer"
              onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    job.message_type === 'image' ? 'bg-blue-100 text-blue-600' :
                    job.message_type === 'video' ? 'bg-teal-100 text-teal-600' :
                    job.message_type === 'audio' ? 'bg-green-100 text-green-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {getMessageTypeIcon(job.message_type)}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{job.transfer_name}</h3>
                      {getStatusBadge(job.status)}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(job.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {job.sent_count}/{job.target_count} קבוצות
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {job.failed_count > 0 && (
                    <span className="text-sm text-red-600 flex items-center gap-1">
                      <XCircle className="w-4 h-4" />
                      {job.failed_count} נכשלו
                    </span>
                  )}
                  {expandedJob === job.id ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>
            </div>

            {expandedJob === job.id && (
              <div className="border-t border-gray-100 bg-gray-50 p-4">
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">תוכן ההודעה</h4>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                      {getMessageTypeIcon(job.message_type)}
                      <span>{getMessageTypeLabel(job.message_type)}</span>
                    </div>
                    {job.message_content && (
                      <p className="text-gray-800 whitespace-pre-wrap">{job.message_content}</p>
                    )}
                  </div>
                </div>

                {job.messages && job.messages.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      קבוצות יעד ({job.messages.length})
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {job.messages.map((msg, idx) => (
                        <div
                          key={msg.id || idx}
                          className={`flex items-center justify-between bg-white rounded-lg p-2.5 border ${
                            msg.status === 'failed' ? 'border-red-200' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              msg.status === 'failed' ? 'bg-red-100' : 'bg-gray-100'
                            }`}>
                              <Users className={`w-4 h-4 ${
                                msg.status === 'failed' ? 'text-red-500' : 'text-gray-500'
                              }`} />
                            </div>
                            <span className="text-sm text-gray-800">{msg.group_name || msg.group_id?.replace('@g.us', '') || msg.group_id}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {msg.status === 'sent' && (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle className="w-3.5 h-3.5" />
                                נשלח
                              </span>
                            )}
                            {msg.status === 'failed' && (
                              <span className="flex items-center gap-1 text-xs text-red-600">
                                <XCircle className="w-3.5 h-3.5" />
                                נכשל
                              </span>
                            )}
                            {msg.status === 'pending' && (
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <Clock className="w-3.5 h-3.5" />
                                ממתין
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>נוצר: {formatDate(job.created_at)}</span>
                    {job.completed_at && <span>הסתיים: {formatDate(job.completed_at)}</span>}
                  </div>
                  
                  <button
                    onClick={(e) => handleDeleteClick(job, e)}
                    disabled={deleting === job.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-white hover:bg-red-500 bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deleting === job.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    מחק
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            הקודם
          </button>
          <span className="text-sm text-gray-500">
            {Math.floor(offset / limit) + 1} מתוך {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            הבא
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">מחיקת אירוע</h3>
              <p className="text-gray-600 mb-1">האם למחוק את האירוע?</p>
              <p className="text-sm text-gray-500 mb-6">{deleteConfirm.transfer_name}</p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  ביטול
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 text-white bg-red-500 hover:bg-red-600 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      מחק
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error/Success Modal */}
      {errorMessage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setErrorMessage(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className={`w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center ${
                errorMessage?.type === 'success' ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {errorMessage?.type === 'success' ? (
                  <CheckCircle className="w-7 h-7 text-green-600" />
                ) : (
                  <AlertTriangle className="w-7 h-7 text-red-600" />
                )}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {errorMessage?.type === 'success' ? 'הצלחה' : 'שגיאה'}
              </h3>
              <p className="text-gray-600 mb-6">{errorMessage?.text || errorMessage}</p>
              
              <button
                onClick={() => setErrorMessage(null)}
                className="w-full px-4 py-2.5 text-white bg-gray-800 hover:bg-gray-900 rounded-xl font-medium transition-colors"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
