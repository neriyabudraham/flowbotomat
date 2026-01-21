import { useState, useEffect } from 'react';
import { 
  Search, ChevronLeft, ChevronRight, Edit, Trash2,
  Check, X, RefreshCw, Eye
} from 'lucide-react';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';

export default function AdminUsers() {
  const { user: currentUser } = useAuthStore();
  
  // Safety check - if no user, don't render
  if (!currentUser) {
    return <div className="text-center py-8 text-gray-500">טוען...</div>;
  }
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    loadUsers();
  }, [pagination.page, search, roleFilter]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: 20,
      });
      if (search) params.append('search', search);
      if (roleFilter) params.append('role', roleFilter);
      
      const { data } = await api.get(`/admin/users?${params}`);
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (userId, updates) => {
    try {
      await api.put(`/admin/users/${userId}`, updates);
      loadUsers();
      setEditingUser(null);
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בעדכון משתמש');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו בלתי הפיכה!')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      loadUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקת משתמש');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">ניהול משתמשים</h2>
        <button 
          onClick={loadUsers} 
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="רענון"
        >
          <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש לפי שם או מייל..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination(p => ({ ...p, page: 1 }));
            }}
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPagination(p => ({ ...p, page: 1 }));
          }}
          className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500"
        >
          <option value="">כל התפקידים</option>
          <option value="user">משתמש</option>
          <option value="expert">מומחה</option>
          <option value="admin">אדמין</option>
          <option value="superadmin">סופר-אדמין</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">משתמש</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">תפקיד</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">סטטוס</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">תוכנית</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">בוטים</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">אנשי קשר</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">נוצר</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">טוען...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">לא נמצאו משתמשים</td>
              </tr>
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div>
                    <div className="font-medium text-gray-800">{u.name || 'ללא שם'}</div>
                    <div className="text-sm text-gray-500">{u.email}</div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editingUser === u.id ? (
                    <select
                      defaultValue={u.role}
                      onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })}
                      className="px-2 py-1 border rounded text-sm"
                    >
                      <option value="user">משתמש</option>
                      <option value="expert">מומחה</option>
                      <option value="admin">אדמין</option>
                      {currentUser.role === 'superadmin' && <option value="superadmin">סופר-אדמין</option>}
                    </select>
                  ) : (
                    <RoleBadge role={u.role} />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {u.is_verified ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">מאומת</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">לא מאומת</span>
                    )}
                    {!u.is_active && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">מושבת</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <PlanBadge plan={u.plan || 'free'} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.bots_count || 0}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.contacts_count || 0}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(u.created_at).toLocaleDateString('he-IL')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedUser(u)}
                      className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
                      title="צפייה"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingUser(editingUser === u.id ? null : u.id)}
                      className="p-1.5 hover:bg-blue-50 rounded text-blue-600"
                      title="עריכה"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {u.is_active ? (
                      <button
                        onClick={() => handleUpdateUser(u.id, { is_active: false })}
                        className="p-1.5 hover:bg-yellow-50 rounded text-yellow-600"
                        title="השבתה"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateUser(u.id, { is_active: true })}
                        className="p-1.5 hover:bg-green-50 rounded text-green-600"
                        title="הפעלה"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    {currentUser.role === 'superadmin' && u.id !== currentUser.id && (
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="p-1.5 hover:bg-red-50 rounded text-red-600"
                        title="מחיקה"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-500">
              {pagination.total} משתמשים
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                disabled={pagination.page <= 1}
                className="p-1.5 hover:bg-white rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 px-2">
                {pagination.page} / {pagination.pages}
              </span>
              <button
                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                disabled={pagination.page >= pagination.pages}
                className="p-1.5 hover:bg-white rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <UserDetailsModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
}

function RoleBadge({ role }) {
  const styles = {
    user: 'bg-gray-100 text-gray-700',
    expert: 'bg-blue-100 text-blue-700',
    admin: 'bg-orange-100 text-orange-700',
    superadmin: 'bg-red-100 text-red-700',
  };
  const labels = {
    user: 'משתמש',
    expert: 'מומחה',
    admin: 'אדמין',
    superadmin: 'סופר-אדמין',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[role] || styles.user}`}>
      {labels[role] || role}
    </span>
  );
}

function PlanBadge({ plan }) {
  const styles = {
    free: 'bg-gray-100 text-gray-600',
    basic: 'bg-blue-100 text-blue-700',
    premium: 'bg-purple-100 text-purple-700',
    enterprise: 'bg-amber-100 text-amber-700',
  };
  const labels = {
    free: 'חינמי',
    basic: 'בסיסי',
    premium: 'פרימיום',
    enterprise: 'ארגוני',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[plan] || styles.free}`}>
      {labels[plan] || plan}
    </span>
  );
}

function UserDetailsModal({ user, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">פרטי משתמש</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">שם</label>
              <div className="font-medium">{user.name || 'לא צוין'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">מייל</label>
              <div className="font-medium">{user.email}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">תפקיד</label>
              <div><RoleBadge role={user.role} /></div>
            </div>
            <div>
              <label className="text-sm text-gray-500">תוכנית</label>
              <div><PlanBadge plan={user.plan || 'free'} /></div>
            </div>
            <div>
              <label className="text-sm text-gray-500">בוטים</label>
              <div className="font-medium">{user.bots_count || 0}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">אנשי קשר</label>
              <div className="font-medium">{user.contacts_count || 0}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">נוצר</label>
              <div className="font-medium">{new Date(user.created_at).toLocaleString('he-IL')}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">סטטוס</label>
              <div className="flex gap-1">
                {user.is_verified ? (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">מאומת</span>
                ) : (
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">לא מאומת</span>
                )}
                {user.is_active ? (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">פעיל</span>
                ) : (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">מושבת</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
