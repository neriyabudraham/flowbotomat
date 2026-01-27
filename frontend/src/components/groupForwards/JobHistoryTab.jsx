import { useState, useEffect } from 'react';
import {
  History, Clock, CheckCircle, XCircle, AlertTriangle, Trash2,
  Image as ImageIcon, Video, Mic, FileText, ChevronDown, ChevronUp,
  User, Users, Phone, Send, Loader2, Eye, RefreshCw
} from 'lucide-react';
import api from '../../services/api';

export default function JobHistoryTab() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
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
    } catch (e) {
      console.error('Failed to fetch history:', e);
    } finally {
      setLoading(false);
    }
  };

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

  const formatPhone = (phone) => {
    if (!phone) return phone;
    let display = phone;
    if (display.startsWith('972')) {
      display = '0' + display.substring(3);
    }
    if (display.length === 10 && display.startsWith('0')) {
      return `${display.slice(0, 3)}-${display.slice(3, 6)}-${display.slice(6)}`;
    }
    return display;
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
    <div className="space-y-4">
      {/* Refresh button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
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
                          <Phone className="w-3.5 h-3.5" />
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

                {/* Timestamps */}
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
                  <span>נוצר: {formatDate(job.created_at)}</span>
                  {job.completed_at && <span>הסתיים: {formatDate(job.completed_at)}</span>}
                  {job.sender_name && <span>שולח: {job.sender_name}</span>}
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
    </div>
  );
}
