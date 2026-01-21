import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useContactsStore from '../store/contactsStore';
import { connectSocket, getSocket, disconnectSocket } from '../services/socket';
import Logo from '../components/atoms/Logo';
import Button from '../components/atoms/Button';
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
    setShowProfile(false);
    setShowMobileSidebar(false);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm z-10">
        <div className="px-2 md:px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2 md:gap-4">
            {/* Mobile menu toggle */}
            <button 
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 md:hidden"
            >
              {showMobileSidebar ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Button variant="ghost" onClick={() => navigate('/dashboard')} className="hidden sm:flex">
              ← חזרה
            </Button>
          </div>
          <Logo />
          <div className="flex items-center gap-2 md:gap-4">
            <span className="text-gray-600 dark:text-gray-300 text-xs md:text-sm hidden sm:block">{user?.email}</span>
            <Button variant="ghost" onClick={handleLogout} className="!px-2 md:!px-4">
              התנתק
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Contact Profile Sidebar - Desktop */}
        {showProfile && selectedContact && (
          <div className="hidden md:block w-80 flex-shrink-0">
            <ContactProfile
              contact={selectedContact}
              onClose={() => setShowProfile(false)}
              onUpdate={(updated) => {
                selectContact(updated.id);
              }}
            />
          </div>
        )}

        {/* Chat View */}
        <div className={`flex-1 ${showMobileSidebar ? 'hidden md:block' : 'block'}`}>
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
        </div>

        {/* Contacts Sidebar - Responsive */}
        <div className={`
          ${showMobileSidebar ? 'block' : 'hidden'} 
          md:block
          w-full md:w-80 flex-shrink-0
          absolute md:relative inset-0 md:inset-auto
          bg-white dark:bg-gray-800 md:bg-transparent
          z-10 md:z-auto
        `}>
          <ContactsList
            contacts={contacts}
            selectedId={selectedContact?.id}
            onSelect={handleSelectContact}
            onSearch={handleSearch}
          />
        </div>

        {/* Mobile Profile Overlay */}
        {showProfile && selectedContact && (
          <div className="md:hidden absolute inset-0 bg-white dark:bg-gray-800 z-20">
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
