import { create } from 'zustand';
import api from '../services/api';

const useContactsStore = create((set, get) => ({
  contacts: [],
  selectedContact: null,
  messages: [],
  isLoading: false,
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
    set({ isLoading: true, error: null });
    try {
      const [contactRes, messagesRes] = await Promise.all([
        api.get(`/contacts/${contactId}`),
        api.get(`/contacts/${contactId}/messages`),
      ]);
      set({
        selectedContact: contactRes.data.contact,
        messages: messagesRes.data.messages,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false, error: err.response?.data?.error || 'שגיאה' });
      throw err;
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
      set({
        selectedContact: get().selectedContact?.id === contactId 
          ? { ...get().selectedContact, is_bot_active: isActive }
          : get().selectedContact,
        contacts: get().contacts.map(c => 
          c.id === contactId ? { ...c, is_bot_active: isActive } : c
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
