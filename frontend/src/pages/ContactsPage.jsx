import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X, ArrowRight, Users, Search } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useContactsStore from '../store/contactsStore';
import { connectSocket, getSocket, disconnectSocket } from '../services/socket';
import Logo from '../components/atoms/Logo';
import ContactsList from '../components/organisms/ContactsList';
import ChatView from '../components/organisms/ChatView';
import ContactProfile from '../components/organisms/ContactProfile';
import api from '../services/api';

export default function ContactsPage() {
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  const { user, logout, fetchMe } = useAuthStore();
  const {
    contacts, selectedContact, messages, isLoading, hasMore, loadingMore,
    fetchContacts, selectContact, clearSelection, addMessage, addNewContact, toggleBot,
    takeoverConversation, loadMoreMessages,
  } = useContactsStore();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    
    fetchMe().then((userData) => {
      // Connect socket after getting user
      if (userData?.user?.id) {
        const socket = connectSocket(userData.user.id);
        
        socket.on('new_message', ({ message, contact }) => {
          // Check if contact is new
          const exists = useContactsStore.getState().contacts.find(c => c.id === contact.id);
          if (!exists) {
            addNewContact(contact, message);
          }
          addMessage(message);
        });
      }
    });
    
    fetchContacts();
    
    return () => {
      disconnectSocket();
    };
  }, []);

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

  // When selecting a contact on mobile, hide the sidebar
  const handleSelectContact = (id) => {
    selectContact(id);
    setShowProfile(true); // Open profile panel by default
    setShowMobileSidebar(false);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 z-10">
        <div className="px-3 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button 
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
              className="p-2 rounded-xl hover:bg-gray-100 md:hidden"
            >
              {showMobileSidebar ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <button 
              onClick={() => navigate('/dashboard')}
              className="hidden sm:flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowRight className="w-5 h-5" />
              <span>חזרה</span>
            </button>
          </div>
          <Logo />
          <div className="flex items-center gap-3">
            <span className="text-gray-500 text-sm hidden sm:block">{user?.email}</span>
            <button 
              onClick={handleLogout}
              className="text-gray-500 hover:text-red-600 text-sm"
            >
              התנתק
            </button>
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
          bg-white border-l border-gray-200
          z-10 md:z-auto
        `}>
          <ContactsList
            contacts={contacts}
            selectedId={selectedContact?.id}
            onSelect={handleSelectContact}
            onSearch={handleSearch}
          />
        </div>

        {/* Chat View - Center */}
        <div className={`flex-1 ${showMobileSidebar ? 'hidden md:flex' : 'flex'} flex-col bg-white`}>
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
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50">
              <div className="text-center p-8">
                <div className="w-20 h-20 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                  <Users className="w-10 h-10 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">בחר איש קשר</h3>
                <p className="text-gray-500 max-w-xs mx-auto">
                  בחר איש קשר מהרשימה כדי לצפות בשיחה ולנהל את האוטומציות
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Contact Profile Sidebar - Left side (RTL) */}
        {showProfile && selectedContact && (
          <div className="hidden md:block w-80 flex-shrink-0 border-r border-gray-200">
            <ContactProfile
              contact={selectedContact}
              onClose={() => setShowProfile(false)}
              onUpdate={(updated) => {
                selectContact(updated.id);
              }}
            />
          </div>
        )}

        {/* Mobile Profile Overlay */}
        {showProfile && selectedContact && (
          <div className="md:hidden absolute inset-0 bg-white z-20">
            <ContactProfile
              contact={selectedContact}
              onClose={() => setShowProfile(false)}
              onUpdate={(updated) => {
                selectContact(updated.id);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
