import { useState, useEffect } from 'react';
import { X, User, Eye, Heart, MessageCircle, ExternalLink, Loader } from 'lucide-react';
import api from '../../services/api';

export default function ViewerProfileModal({ viewer, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Normalize field names (backend returns viewer_phone/viewer_name)
  const phone = viewer.viewer_phone || viewer.phone || '';
  const name = viewer.viewer_name || viewer.name || '';
  const viewCount = viewer.statuses_viewed ?? viewer.view_count ?? 0;
  const viewPct = viewer.view_percentage ?? 0;
  const lastView = viewer.last_seen || viewer.last_view;
  const firstView = viewer.first_seen || viewer.first_view;

  useEffect(() => {
    loadProfile();
  }, [phone]);

  const loadProfile = async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/view-filter/viewers/${encodeURIComponent(phone)}`);
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const whatsappLink = `https://wa.me/${phone.replace(/\D/g, '')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        dir="rtl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500 to-violet-600 p-5 text-white flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate">{name || 'ללא שם'}</h2>
            <p className="text-white/80 text-sm" dir="ltr">{phone}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              title="פתח ב-WhatsApp"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-gray-100 border-b border-gray-100">
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{viewCount}</div>
            <div className="text-xs text-gray-500 mt-1">סטטוסים שצפה</div>
          </div>
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{Math.round(viewPct)}%</div>
            <div className="text-xs text-gray-500 mt-1">מסך הסטטוסים</div>
          </div>
          <div className="p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              {viewer.has_reaction && <Heart className="w-5 h-5 text-red-400" />}
              {viewer.has_reply && <MessageCircle className="w-5 h-5 text-blue-400" />}
              {!viewer.has_reaction && !viewer.has_reply && <span className="text-gray-300 text-lg">—</span>}
            </div>
            <div className="text-xs text-gray-500 mt-1">אינטראקציות</div>
          </div>
        </div>

        {/* Dates */}
        <div className="px-5 py-3 bg-gray-50 flex items-center justify-between text-sm border-b border-gray-100">
          <div>
            <span className="text-gray-500">ראשון: </span>
            <span className="font-medium text-gray-700">
              {firstView ? new Date(firstView).toLocaleDateString('he-IL') : '—'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">אחרון: </span>
            <span className="font-medium text-gray-700">
              {lastView ? new Date(lastView).toLocaleDateString('he-IL') : '—'}
            </span>
          </div>
        </div>

        {/* Profile Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 text-purple-500 animate-spin" />
            </div>
          ) : !profile ? (
            <div className="py-8 text-center text-gray-400 text-sm">לא נמצאו פרטים נוספים</div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Viewed Statuses */}
              {profile.viewedStatuses?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                    <Eye className="w-4 h-4 text-purple-500" />
                    סטטוסים שנצפו ({profile.viewedStatuses.length})
                  </h3>
                  <div className="space-y-2">
                    {profile.viewedStatuses.slice(0, 10).map((s, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-sm text-gray-700 truncate flex-1">{s.status_caption || `סטטוס #${i + 1}`}</span>
                        <span className="text-xs text-gray-400 mr-3 flex-shrink-0">
                          {s.viewed_at ? new Date(s.viewed_at).toLocaleDateString('he-IL') : ''}
                        </span>
                      </div>
                    ))}
                    {profile.viewedStatuses.length > 10 && (
                      <p className="text-xs text-center text-gray-400">ועוד {profile.viewedStatuses.length - 10} סטטוסים...</p>
                    )}
                  </div>
                </div>
              )}

              {/* Reactions */}
              {profile.reactions?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                    <Heart className="w-4 h-4 text-red-400" />
                    תגובות ({profile.reactions.length})
                  </h3>
                  <div className="space-y-2">
                    {profile.reactions.map((r, i) => (
                      <div key={i} className="flex items-center gap-3 bg-red-50 rounded-lg px-3 py-2">
                        <span className="text-lg">{r.reaction || '❤️'}</span>
                        <span className="text-sm text-gray-700 truncate flex-1">{r.status_caption || 'סטטוס'}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {r.reacted_at ? new Date(r.reacted_at).toLocaleDateString('he-IL') : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Replies */}
              {profile.replies?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                    <MessageCircle className="w-4 h-4 text-blue-400" />
                    תשובות ({profile.replies.length})
                  </h3>
                  <div className="space-y-2">
                    {profile.replies.map((r, i) => (
                      <div key={i} className="bg-blue-50 rounded-lg px-3 py-2">
                        <p className="text-sm text-gray-700">{r.reply_text || '—'}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {r.replied_at ? new Date(r.replied_at).toLocaleDateString('he-IL') : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
