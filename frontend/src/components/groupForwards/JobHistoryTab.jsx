import { useState, useEffect, useMemo } from 'react';
import {
  History, Clock, CheckCircle, XCircle, AlertTriangle, Trash2,
  Image as ImageIcon, Video, Mic, FileText, ChevronDown, ChevronUp,
  User, Users, Phone, Send, Loader2, Eye, RefreshCw, TrendingUp,
  BarChart3, X, Globe
} from 'lucide-react';
import api from '../../services/api';

export default function JobHistoryTab() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState(null);
  const [selectedSender, setSelectedSender] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // job to delete
  const [errorMessage, setErrorMessage] = useState(null);
  const limit = 20;

  useEffect(() => {
    fetchHistory();
  }, [offset]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/group-forwards/jobs/history', {
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

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    const jobId = deleteConfirm.id;
    
    try {
      setDeleting(jobId);
      await api.delete(`/group-forwards/jobs/${jobId}`);
      setJobs(jobs.filter(j => j.id !== jobId));
      setTotal(t => t - 1);
      if (expandedJob === jobId) setExpandedJob(null);
      setDeleteConfirm(null);
    } catch (e) {
      console.error('Failed to delete job:', e);
      setErrorMessage('שגיאה במחיקת האירוע');
      setDeleteConfirm(null);
    } finally {
      setDeleting(null);
    }
  };

  // Format phone for display - defined before useMemo that uses it
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
    if (display.length === 9 && display.startsWith('5')) {
      display = '0' + display;
      return `${display.slice(0, 3)}-${display.slice(3, 6)}-${display.slice(6)}`;
    }
    return display;
  };

  // Calculate stats from jobs if not provided by API
  const calculatedStats = useMemo(() => {
    if (stats) return stats;
    if (jobs.length === 0) return null;
    
    let totalSent = 0;
    let totalFailed = 0;
    let totalTargets = 0;
    const senderStats = {};
    
    jobs.forEach(job => {
      totalSent += job.sent_count || 0;
      totalFailed += job.failed_count || 0;
      totalTargets += job.total_targets || 0;
      
      const senderKey = job.sender_phone || 'unknown';
      const senderName = job.sender_name || formatPhone(job.sender_phone) || 'לא ידוע';
      if (!senderStats[senderKey]) {
        senderStats[senderKey] = { 
          name: senderName, 
          phone: job.sender_phone,
          sent: 0, 
          failed: 0,
          jobs: 0,
          targets: 0
        };
      }
      senderStats[senderKey].sent += job.sent_count || 0;
      senderStats[senderKey].failed += job.failed_count || 0;
      senderStats[senderKey].jobs += 1;
      senderStats[senderKey].targets += job.total_targets || 0;
    });
    
    const successRate = totalTargets > 0 ? Math.round((totalSent / totalTargets) * 100) : 0;
    
    return {
      totalJobs: total,
      totalSent,
      totalFailed,
      totalTargets,
      successRate,
      senders: Object.entries(senderStats)
        .map(([key, data]) => ({ key, ...data }))
        .sort((a, b) => b.sent - a.sent)
    };
  }, [jobs, stats, total]);

  // Get selected sender stats
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
      sending: 'bg-blue-100 text-blue-700',
      pending: 'bg-purple-100 text-purple-700',
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
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
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
          {/* Total Jobs */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-4 border border-purple-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{calculatedStats.totalJobs}</p>
                <p className="text-xs text-gray-500">סה״כ שליחות</p>
              </div>
            </div>
          </div>

          {/* Success Rate */}
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

          {/* Total Sent */}
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

          {/* Failed */}
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

      {/* Sender Filter */}
      {calculatedStats && calculatedStats.senders && calculatedStats.senders.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">סינון לפי שולח:</span>
            </div>
            <select
              value={selectedSender}
              onChange={(e) => setSelectedSender(e.target.value)}
              className="flex-1 max-w-xs px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
            >
              <option value="">כל השולחים</option>
              {calculatedStats.senders.map((sender) => (
                <option key={sender.key} value={sender.key}>
                  {sender.name}
                </option>
              ))}
            </select>
          </div>
          
          {/* Selected Sender Stats */}
          {selectedSenderStats && (
            <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">{selectedSenderStats.name}</p>
                  {selectedSenderStats.phone && (
                    <p className="text-xs text-gray-500" dir="ltr">{formatPhone(selectedSenderStats.phone)}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-2 bg-white rounded-lg">
                  <p className="text-lg font-bold text-purple-600">{selectedSenderStats.jobs}</p>
                  <p className="text-xs text-gray-500">שליחות</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg">
                  <p className="text-lg font-bold text-green-600">{selectedSenderStats.sent}</p>
                  <p className="text-xs text-gray-500">נשלחו</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg">
                  <p className="text-lg font-bold text-red-600">{selectedSenderStats.failed}</p>
                  <p className="text-xs text-gray-500">נכשלו</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg">
                  <p className="text-lg font-bold text-blue-600">
                    {selectedSenderStats.targets > 0 ? Math.round((selectedSenderStats.sent / selectedSenderStats.targets) * 100) : 0}%
                  </p>
                  <p className="text-xs text-gray-500">הצלחה</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors border border-gray-200"
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
            {/* Job Header */}
            <div
              className="p-4 cursor-pointer"
              onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Message Type Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    job.message_type === 'image' ? 'bg-blue-100 text-blue-600' :
                    job.message_type === 'video' ? 'bg-purple-100 text-purple-600' :
                    job.message_type === 'audio' ? 'bg-green-100 text-green-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {getMessageTypeIcon(job.message_type)}
                  </div>

                  {/* Job Info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{job.forward_name}</h3>
                      {getStatusBadge(job.status)}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(job.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {job.sent_count}/{job.total_targets} קבוצות
                      </span>
                      {job.sender_phone && (
                        <span className="flex items-center gap-1">
                          {job.sender_phone === 'website' ? (
                            <Globe className="w-3.5 h-3.5" />
                          ) : (
                            <Phone className="w-3.5 h-3.5" />
                          )}
                          {formatPhone(job.sender_phone)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expand/Collapse */}
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

            {/* Expanded Details */}
            {expandedJob === job.id && (
              <div className="border-t border-gray-100 bg-gray-50 p-4">
                {/* Message Content */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">תוכן ההודעה</h4>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                      {getMessageTypeIcon(job.message_type)}
                      <span>{getMessageTypeLabel(job.message_type)}</span>
                    </div>
                    {job.message_text && (
                      <p className="text-gray-800 whitespace-pre-wrap">{job.message_text}</p>
                    )}
                    {job.media_url && job.message_type === 'image' && (
                      <img 
                        src={job.media_url} 
                        alt="Media" 
                        className="mt-2 max-w-xs rounded-lg border border-gray-200"
                      />
                    )}
                    {job.media_url && job.message_type === 'video' && (
                      <video 
                        src={job.media_url} 
                        controls 
                        className="mt-2 max-w-xs rounded-lg border border-gray-200"
                      />
                    )}
                    {job.media_url && job.message_type === 'audio' && (
                      <audio 
                        src={job.media_url} 
                        controls 
                        className="mt-2 w-full"
                      />
                    )}
                  </div>
                </div>

                {/* Target Groups */}
                {job.messages && job.messages.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      קבוצות יעד ({job.messages.length})
                    </h4>
                    <div className="grid gap-2 max-h-64 overflow-y-auto">
                      {job.messages.map((msg, idx) => (
                        <div
                          key={msg.id || idx}
                          className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-gray-200"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                              <Users className="w-4 h-4 text-gray-500" />
                            </div>
                            <span className="text-sm text-gray-800">{msg.group_name || 'קבוצה'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {msg.status === 'sent' && (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle className="w-3.5 h-3.5" />
                                נשלח
                              </span>
                            )}
                            {msg.status === 'failed' && (
                              <span className="flex items-center gap-1 text-xs text-red-600" title={msg.error_message}>
                                <XCircle className="w-3.5 h-3.5" />
                                נכשל
                              </span>
                            )}
                            {msg.status === 'deleted' && (
                              <span className="flex items-center gap-1 text-xs text-orange-600">
                                <Trash2 className="w-3.5 h-3.5" />
                                נמחק
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

                {/* Error Message */}
                {job.error_message && (
                  <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-800">שגיאה</p>
                        <p className="text-sm text-red-700">{job.error_message}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timestamps and Delete */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>נוצר: {formatDate(job.created_at)}</span>
                    {job.completed_at && <span>הסתיים: {formatDate(job.completed_at)}</span>}
                    {job.sender_name && <span>שולח: {job.sender_name}</span>}
                  </div>
                  
                  {/* Delete button - only for completed jobs */}
                  {!['sending', 'pending', 'confirmed'].includes(job.status) && (
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
                  )}
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
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            הקודם
          </button>
          <span className="text-sm text-gray-500">
            {Math.floor(offset / limit) + 1} מתוך {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <p className="text-sm text-gray-500 mb-6">{deleteConfirm.forward_name}</p>
              
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

      {/* Error Modal */}
      {errorMessage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setErrorMessage(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">שגיאה</h3>
              <p className="text-gray-600 mb-6">{errorMessage}</p>
              
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
