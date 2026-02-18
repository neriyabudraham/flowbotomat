import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Menu, X, ArrowLeft, Users, Search, MessageSquare, Bot, 
  Settings, Phone, Sparkles, TrendingUp, Clock, UserCheck,
  Activity, Send, Filter
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
  const { user, logout, fetchMe } = useAuthStore();
  const {
    contacts, selectedContact, messages, isLoading, hasMore, loadingMore,
    fetchContacts, selectContact, clearSelection, addMessage, addNewContact, toggleBot,
    takeoverConversation, loadMoreMessages, updateMessageReaction,
    loadMoreContacts, hasMoreContacts, loadingMoreContacts, total,
  } = useContactsStore();

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
    
    return () => {
      unsubscribeMessages();
      disconnectSocket();
    };
  }, []);

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
