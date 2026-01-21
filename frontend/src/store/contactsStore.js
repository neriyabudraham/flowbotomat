import { create } from 'zustand';
import api from '../services/api';

const useContactsStore = create((set, get) => ({
  contacts: [],
  selectedContact: null,
  messages: [],
  isLoading: false,
  loadingMore: false,
  hasMore: true,
  error: null,
  total: 0,

  fetchContacts: async (search = '') => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get('/contacts', { params: { search } });
      set({ contacts: data.contacts, total: data.total, isLoading: false });
      return data;
    } catch (err) {
      set({ isLoading: false, error: err.response?.data?.error || 'שגיאה' });
      throw err;
    }
  },

  selectContact: async (contactId) => {
    set({ isLoading: true, error: null, hasMore: true });
    try {
      const [contactRes, messagesRes] = await Promise.all([
        api.get(`/contacts/${contactId}`),
        api.get(`/contacts/${contactId}/messages`, { params: { limit: 50 } }),
      ]);
      set({
        selectedContact: contactRes.data.contact,
        messages: messagesRes.data.messages,
        hasMore: messagesRes.data.hasMore ?? messagesRes.data.messages.length >= 50,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false, error: err.response?.data?.error || 'שגיאה' });
      throw err;
    }
  },

  loadMoreMessages: async () => {
    const { selectedContact, messages, loadingMore, hasMore } = get();
    if (!selectedContact || loadingMore || !hasMore) return;
    
    set({ loadingMore: true });
    try {
      const oldestMessage = messages[0];
      const { data } = await api.get(`/contacts/${selectedContact.id}/messages`, {
        params: { 
          limit: 50,
          before: oldestMessage?.sent_at 
        }
      });
      set({
        messages: [...data.messages, ...messages],
        hasMore: data.hasMore ?? data.messages.length >= 50,
        loadingMore: false,
      });
    } catch (err) {
      set({ loadingMore: false });
    }
  },

  clearSelection: () => {
    set({ selectedContact: null, messages: [] });
  },

  addMessage: (message) => {
    const { selectedContact, contacts } = get();
    
    // Add to messages if viewing this contact
    if (selectedContact && message.contact_id === selectedContact.id) {
      set({ messages: [...get().messages, message] });
    }
    
    // Update contact in list
    const updatedContacts = contacts.map(c => 
      c.id === message.contact_id 
        ? { ...c, last_message: message.content, last_message_at: message.sent_at }
        : c
    );
    set({ contacts: updatedContacts });
  },

  addNewContact: (contact, message) => {
    const { contacts } = get();
    const exists = contacts.find(c => c.id === contact.id);
    if (!exists) {
      set({ contacts: [{ ...contact, last_message: message?.content }, ...contacts] });
    }
  },

  toggleBot: async (contactId, isActive) => {
    try {
      const { data } = await api.patch(`/contacts/${contactId}/bot`, { is_bot_active: isActive });
      const contact = data.contact;
      set({
        selectedContact: get().selectedContact?.id === contactId 
          ? contact
          : get().selectedContact,
        contacts: get().contacts.map(c => 
          c.id === contactId ? { ...c, is_bot_active: contact.is_bot_active, takeover_until: contact.takeover_until } : c
        ),
      });
      return data;
    } catch (err) {
      throw err;
    }
  },

  takeoverConversation: async (contactId, minutes) => {
    try {
      const { data } = await api.post(`/contacts/${contactId}/takeover`, { minutes });
      const contact = data.contact;
      set({
        selectedContact: get().selectedContact?.id === contactId 
          ? contact
          : get().selectedContact,
        contacts: get().contacts.map(c => 
          c.id === contactId ? { ...c, is_bot_active: contact.is_bot_active, takeover_until: contact.takeover_until } : c
        ),
      });
      return data;
    } catch (err) {
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useContactsStore;
