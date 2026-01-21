import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useContactsStore from '../store/contactsStore';
import { connectSocket, getSocket, disconnectSocket } from '../services/socket';
import Logo from '../components/atoms/Logo';
import Button from '../components/atoms/Button';
import ContactsList from '../components/organisms/ContactsList';
import ChatView from '../components/organisms/ChatView';
import api from '../services/api';

export default function ContactsPage() {
  const navigate = useNavigate();
  const { user, logout, fetchMe } = useAuthStore();
  const {
    contacts, selectedContact, messages, isLoading,
    fetchContacts, selectContact, clearSelection, addMessage, addNewContact, toggleBot,
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

  const handleLogout = () => {
    disconnectSocket();
    logout();
    navigate('/login');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm z-10">
        <div className="px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              ← חזרה
            </Button>
          </div>
          <Logo />
          <div className="flex items-center gap-4">
            <span className="text-gray-600 text-sm">{user?.email}</span>
            <Button variant="ghost" onClick={handleLogout}>
              התנתק
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat View */}
        <div className="flex-1">
          <ChatView
            contact={selectedContact}
            messages={messages}
            onSendMessage={handleSendMessage}
            onToggleBot={handleToggleBot}
            isLoading={isLoading}
          />
        </div>

        {/* Contacts Sidebar */}
        <div className="w-80 flex-shrink-0">
          <ContactsList
            contacts={contacts}
            selectedId={selectedContact?.id}
            onSelect={selectContact}
            onSearch={handleSearch}
          />
        </div>
      </div>
    </div>
  );
}
