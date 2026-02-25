import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Menu, X, ArrowLeft, Users, Search, MessageSquare, Bot, 
  Settings, Phone, Sparkles, TrendingUp, Clock, UserCheck,
  Activity, Send, Filter, Shield, Crown, Lock, AlertTriangle
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import useContactsStore from '../store/contactsStore';
import { connectSocket, disconnectSocket, onMessage } from '../services/socket';
import Logo from '../components/atoms/Logo';
import ContactsList from '../components/organisms/ContactsList';
import ChatView from '../components/organisms/ChatView';
import ContactProfile from '../components/organisms/ContactProfile';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../components/AccountSwitcher';
import api from '../services/api';

export default function ContactsPage() {
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(true); // Open by default
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  const [stats, setStats] = useState({ totalContacts: 0, activeChats: 0, messagesCount: 0 });
  const [contactLimit, setContactLimit] = useState(null);
  const { user, logout, fetchMe } = useAuthStore();
  const {
    contacts, selectedContact, messages, isLoading, hasMore, loadingMore,
    fetchContacts, selectContact, clearSelection, addMessage, addNewContact, toggleBot,
    takeoverConversation, loadMoreMessages, updateMessageReaction,
    loadMoreContacts, hasMoreContacts, loadingMoreContacts, total,
  } = useContactsStore();

  // Check if user is admin (either directly or viewing as another account)
  const isAdmin = (() => {
    if (user && ['admin', 'superadmin'].includes(user.role)) return true;
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.viewingAs) return true;
      }
    } catch (e) {}
    return false;
  })();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    
    // Register message handler FIRST - before connecting socket
    const unsubscribeMessages = onMessage((eventType, data) => {
      console.log('[ContactsPage] 📨 Received message event:', eventType);
      
      if (eventType === 'new_message') {
        const { message, contact } = data;
        console.log('[ContactsPage] Adding incoming message:', message?.id);
        const exists = useContactsStore.getState().contacts.find(c => c.id === contact?.id);
        if (!exists && contact) {
          addNewContact(contact, message);
        }
        addMessage(message);
      }
      
      if (eventType === 'outgoing_message') {
        const { message, contact } = data;
        console.log('[ContactsPage] Adding outgoing message:', message?.id);
        const exists = useContactsStore.getState().contacts.find(c => c.id === contact?.id);
        if (!exists && contact) {
          addNewContact(contact, message);
        }
        addMessage(message);
      }
      
      if (eventType === 'message_reaction') {
        const { messageId, reaction } = data;
        console.log('[ContactsPage] Updating reaction:', messageId, reaction);
        updateMessageReaction(messageId, reaction);
      }
    });
    
    // Then connect socket
    fetchMe().then((userData) => {
      if (userData?.user?.id) {
        connectSocket(userData.user.id);
      }
    });
    
    fetchContacts();
    loadStats();
    loadContactLimit();
    
    return () => {
      unsubscribeMessages();
      disconnectSocket();
    };
  }, []);

  const loadContactLimit = async () => {
    try {
      const { data } = await api.get('/contacts/limit');
      setContactLimit(data);
    } catch (err) {
      console.error('Failed to load contact limit:', err);
    }
  };

  const loadStats = async () => {
    try {
      const { data } = await api.get('/contacts/stats');
      setStats(data);
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  };

  const handleSearch = useCallback((search) => {
    fetchContacts(search);
  }, [fetchContacts]);

  const handleSendMessage = async (text) => {
    if (!selectedContact) return;
    
    try {
      const { data } = await api.post(`/contacts/${selectedContact.id}/messages`, {
        content: text,
        message_type: 'text',
      });
      addMessage(data.message);
    } catch (err) {
      console.error('Send message error:', err);
    }
  };

  const handleToggleBot = async (isActive) => {
    if (!selectedContact) return;
    try {
      await toggleBot(selectedContact.id, isActive);
    } catch (err) {
      console.error('Toggle bot error:', err);
    }
  };

  const handleTakeover = async (minutes) => {
    if (!selectedContact) return;
    try {
      await takeoverConversation(selectedContact.id, minutes);
    } catch (err) {
      console.error('Takeover error:', err);
    }
  };

  const handleLoadMore = () => {
    loadMoreMessages();
  };

  const handleLogout = () => {
    disconnectSocket();
    logout();
    navigate('/login');
  };

  const handleSelectContact = (id) => {
    selectContact(id);
    setShowProfile(true);
    setShowMobileSidebar(false);
  };

  const activeContacts = contacts.filter(c => {
    if (!c.last_message_at) return false;
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return new Date(c.last_message_at) > hourAgo;
  }).length;

  // Check if contact limit is exceeded - block Live Chat
  const limitExceeded = contactLimit && !contactLimit.allowed && !contactLimit.statusBotUnlimited && contactLimit.limit !== -1;

  // Show limit exceeded page
  if (limitExceeded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30" dir="rtl">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => navigate('/dashboard')}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="h-8 w-px bg-gray-200" />
                <Logo />
              </div>
              
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <button
                    onClick={() => navigate('/admin')}
                    className="p-2 hover:bg-red-50 rounded-xl transition-colors group"
                    title="ממשק ניהול"
                  >
                    <Shield className="w-5 h-5 text-red-500 group-hover:text-red-600" />
                  </button>
                )}
                <NotificationsDropdown />
                <div className="h-8 w-px bg-gray-200" />
                <AccountSwitcher />
                <button 
                  onClick={handleLogout}
                  className="hidden md:block px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors"
                >
                  התנתק
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-center">
            {/* Icon */}
            <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl flex items-center justify-center shadow-xl shadow-amber-500/30">
              <Lock className="w-12 h-12 text-white" />
            </div>
            
            {/* Title */}
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              הגעת למגבלת אנשי הקשר
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-lg mx-auto">
              הלייב צ'אט לא זמין כרגע כי הגעת למגבלת אנשי הקשר בתוכנית שלך.
            </p>
            
            {/* Limit Info */}
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-amber-50 border border-amber-200 rounded-2xl mb-8">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span className="text-amber-800 font-medium">
                {contactLimit.used} מתוך {contactLimit.limit} אנשי קשר בשימוש
              </span>
            </div>
            
            {/* Features List */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-lg p-8 mb-8 text-right">
              <h3 className="text-lg font-bold text-gray-900 mb-6 text-center">מה תקבל עם שדרוג?</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl">
                  <div className="p-2 bg-blue-500 rounded-xl">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">יותר אנשי קשר</p>
                    <p className="text-sm text-gray-500">הגדל את מגבלת אנשי הקשר</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl">
                  <div className="p-2 bg-blue-500 rounded-xl">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">שיחות ללא הגבלה</p>
                    <p className="text-sm text-gray-500">נהל את כל השיחות שלך</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl">
                  <div className="p-2 bg-blue-500 rounded-xl">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">בוטים נוספים</p>
                    <p className="text-sm text-gray-500">צור יותר אוטומציות</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl">
                  <div className="p-2 bg-blue-500 rounded-xl">
                    <Send className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">הרצות נוספות</p>
                    <p className="text-sm text-gray-500">יותר הרצות בוט בחודש</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* CTA */}
            <button
              onClick={() => navigate('/pricing')}
              className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-amber-500/30 transition-all hover:scale-105"
            >
              <Crown className="w-6 h-6" />
              שדרג עכשיו
            </button>
            
            <p className="text-sm text-gray-500 mt-4">
              <button onClick={() => navigate('/dashboard')} className="text-amber-600 hover:underline">
                חזרה לדשבורד
              </button>
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50" dir="rtl">
      
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile menu toggle */}
              <button 
                onClick={() => setShowMobileSidebar(!showMobileSidebar)}
                className="p-2 rounded-xl hover:bg-gray-100 md:hidden transition-colors"
              >
                {showMobileSidebar ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              
              <button 
                onClick={() => navigate('/dashboard')}
                className="hidden sm:flex items-center gap-2 p-2 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="hidden sm:block h-8 w-px bg-gray-200" />
              <Logo />
            </div>

            {/* Center Stats - Desktop */}
            <div className="hidden lg:flex items-center gap-6">
              <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl">
                <Users className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">{contacts.length} אנשי קשר</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl">
                <Activity className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-gray-700">{activeContacts} פעילים</span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className="p-2 hover:bg-red-50 rounded-xl transition-colors group"
                  title="ממשק ניהול"
                >
                  <Shield className="w-5 h-5 text-red-500 group-hover:text-red-600" />
                </button>
              )}
              <button 
                onClick={() => navigate('/settings?tab=livechat')}
                className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                title="הגדרות לייב צ'אט"
              >
                <Settings className="w-5 h-5 text-gray-500" />
              </button>
              <NotificationsDropdown />
              <div className="hidden sm:block h-8 w-px bg-gray-200" />
              <AccountSwitcher />
              <button 
                onClick={handleLogout}
                className="hidden md:block px-3 py-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Contacts Sidebar - Right side (RTL) */}
        <div className={`
          ${showMobileSidebar ? 'block' : 'hidden'} 
          md:block
          w-full md:w-80 lg:w-96 flex-shrink-0
          absolute md:relative inset-0 md:inset-auto
          bg-white border-l border-gray-200/80
          z-10 md:z-auto
          shadow-xl md:shadow-none
        `}>
          <ContactsList
            contacts={contacts}
            selectedId={selectedContact?.id}
            onSelect={handleSelectContact}
            onSearch={handleSearch}
            stats={{ total: total || contacts.length, active: activeContacts }}
            onContactsChange={() => {
              fetchContacts();
              loadStats();
            }}
            onLoadMore={loadMoreContacts}
            hasMoreContacts={hasMoreContacts}
            loadingMoreContacts={loadingMoreContacts}
            totalContacts={total}
          />
        </div>

        {/* Chat View - Center */}
        <div className={`flex-1 ${showMobileSidebar ? 'hidden md:flex' : 'flex'} flex-col`}>
          {selectedContact ? (
            <ChatView
              contact={selectedContact}
              messages={messages}
              onSendMessage={handleSendMessage}
              onToggleBot={handleToggleBot}
              onTakeover={handleTakeover}
              onShowProfile={() => setShowProfile(true)}
              onLoadMore={handleLoadMore}
              hasMore={hasMore}
              loadingMore={loadingMore}
              isLoading={isLoading}
              onBack={() => setShowMobileSidebar(true)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-blue-50">
              <div className="text-center p-8 max-w-md">
                {/* Animated Icon */}
                <div className="relative mx-auto w-32 h-32 mb-6">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-3xl blur-2xl opacity-20 animate-pulse" />
                  <div className="relative w-full h-full bg-gradient-to-br from-blue-100 to-indigo-100 rounded-3xl flex items-center justify-center">
                    <MessageSquare className="w-14 h-14 text-blue-600" />
                  </div>
                </div>
                
                <h3 className="text-2xl font-bold text-gray-900 mb-3">בחר שיחה</h3>
                <p className="text-gray-500 mb-6">
                  בחר איש קשר מהרשימה כדי לצפות בשיחה ולנהל את התקשורת
                </p>
                
                {/* Quick Stats Cards */}
                <div className="grid grid-cols-3 gap-3 mt-8">
                  <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <Users className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                    <div className="text-lg font-bold text-gray-900">{contacts.length}</div>
                    <div className="text-xs text-gray-500">אנשי קשר</div>
                  </div>
                  <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <Activity className="w-6 h-6 text-green-500 mx-auto mb-2" />
                    <div className="text-lg font-bold text-gray-900">{activeContacts}</div>
                    <div className="text-xs text-gray-500">פעילים</div>
                  </div>
                  <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <Bot className="w-6 h-6 text-purple-500 mx-auto mb-2" />
                    <div className="text-lg font-bold text-gray-900">{contacts.filter(c => c.is_bot_active).length}</div>
                    <div className="text-xs text-gray-500">בוט פעיל</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Contact Profile Sidebar - Left side (RTL) */}
        {showProfile && selectedContact && (
          <div className="hidden lg:block w-96 flex-shrink-0 border-r border-gray-200/80 bg-white shadow-xl">
            <ContactProfile
              contact={selectedContact}
              onClose={() => setShowProfile(false)}
              onUpdate={(updated) => {
                selectContact(updated.id);
              }}
              onDelete={() => {
                clearSelection();
                fetchContacts();
                loadStats();
              }}
            />
          </div>
        )}

        {/* Mobile Profile Overlay */}
        {showProfile && selectedContact && (
          <div className="lg:hidden absolute inset-0 bg-white z-20">
            <ContactProfile
              contact={selectedContact}
              onClose={() => setShowProfile(false)}
              onUpdate={(updated) => {
                selectContact(updated.id);
              }}
              onDelete={() => {
                clearSelection();
                fetchContacts();
                loadStats();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
