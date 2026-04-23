import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Smartphone, Upload, Clock, Users, ArrowLeft, RefreshCw,
  Check, Plus, Trash2, Eye, Heart, MessageCircle, Image,
  Video, Mic, Type, Palette, Send, AlertCircle, X, Loader,
  QrCode, Wifi, WifiOff, Phone, ChevronDown, ChevronUp, List, ChevronLeft, ChevronRight,
  Loader2, Shield, Zap, HelpCircle, Mail, Home, Settings, Crown,
  CheckCircle, BarChart, Play, Pause, Volume2, History, Calendar, UserPlus,
  ToggleLeft, ToggleRight
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import useWhatsappStore from '../../store/whatsappStore';
import Logo from '../../components/atoms/Logo';
import NotificationsDropdown from '../../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../../components/AccountSwitcher';
import api from '../../services/api';
import { ToastProvider, useToast } from '../../components/ui/Toast';
import ImportedContactsModal from '../../components/statusBot/ImportedContactsModal';
import io from 'socket.io-client';

const BOT_NUMBER = '+972 53-923-2960';

// Format phone number for display: 050-000-0000 or +972-50-000-0000
function formatPhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Israeli number with country code (972...)
  if (digits.startsWith('972') && digits.length >= 12) {
    const local = digits.slice(3); // Remove 972
    if (local.length === 9) {
      return `0${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`;
    }
  }
  
  // Local Israeli number (05x...)
  if (digits.startsWith('0') && digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  
  // 9-digit number (assume Israeli, add 0)
  if (digits.length === 9 && digits.startsWith('5')) {
    return `0${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  
  // Fallback - return as is with + if has country code
  if (digits.length > 10) {
    return `+${digits}`;
  }
  
  return phone;
}

// Convert phone to WhatsApp URL
function getWhatsAppUrl(phone) {
  if (!phone) return null;
  // Remove all non-digit characters and ensure it has country code
  let digits = phone.replace(/\D/g, '');
  // If it's an Israeli number without country code, add 972
  if (digits.startsWith('0')) {
    digits = '972' + digits.slice(1);
  } else if (digits.length === 9 && digits.startsWith('5')) {
    digits = '972' + digits;
  }
  return `https://wa.me/${digits}`;
}

// Clickable phone number component
function ClickablePhone({ phone, className = '' }) {
  const url = getWhatsAppUrl(phone);
  const display = formatPhoneNumber(phone);
  
  if (!url) return <span className={className}>{display}</span>;
  
  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer" 
      className={`hover:underline ${className}`}
    >
      {display}
    </a>
  );
}

export default function StatusBotDashboardPage() {
  return (
    <ToastProvider>
      <StatusBotDashboardContent />
    </ToastProvider>
  );
}

function StatusBotDashboardContent() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, fetchMe, logout } = useAuthStore();
  const { connection: mainConnection, fetchStatus: fetchMainStatus } = useWhatsappStore();

  // Check if user is admin (either directly or viewing as another account)
  const isAdmin = (() => {
    if (user && ['admin', 'superadmin'].includes(user.role)) return true;
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.viewingAs && payload.accessType === 'admin') return true;
      }
    } catch (e) {}
    return false;
  })();
  
  // State
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('loading'); // loading, select, qr, connected, dashboard, no_subscription
  const [connection, setConnection] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [existingSession, setExistingSession] = useState(null);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [authorizedNumbers, setAuthorizedNumbers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [queue, setQueue] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [activeTab, setActiveTab] = useState('upload'); // upload, pending, history, scheduled, numbers
  const [pendingStatuses, setPendingStatuses] = useState([]); // Pending statuses from WhatsApp bot
  const [failedStatuses, setFailedStatuses] = useState([]); // Failed/cancelled statuses
  const [inProgressStatuses, setInProgressStatuses] = useState([]); // Statuses in queue (pending/processing)
  const [scheduledViewMode, setScheduledViewMode] = useState('calendar'); // 'list' | 'calendar'
  const [qrCode, setQrCode] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Upload form state
  const [statusType, setStatusType] = useState('text');
  const [textContent, setTextContent] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#782138');
  const [mediaUrl, setMediaUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaInputMode, setMediaInputMode] = useState('file'); // 'file' | 'url' | 'record'
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedAudio, setRecordedAudio] = useState(null); // For playback
  
  // Scheduling state
  const [scheduleMode, setScheduleMode] = useState('now'); // 'now' | 'schedule'
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  
  // Video split state
  const [videoSplitInfo, setVideoSplitInfo] = useState(null); // { needsSplit, partCount, partDuration, parts }
  const [videoPartCaptions, setVideoPartCaptions] = useState([]); // Array of captions for each part
  const [analyzingVideo, setAnalyzingVideo] = useState(false);
  
  // Available colors (loaded from settings)
  const [availableColors, setAvailableColors] = useState([
    { id: '782138', title: 'בורדו' },
    { id: '6e267d', title: 'סגול כהה' },
    { id: '8d698f', title: 'סגול לילך' },
    { id: 'c79ecc', title: 'סגול בהיר' },
    { id: '8294c9', title: 'כחול אפרפר' },
    { id: '7d8fa3', title: 'אפור' },
    { id: '243740', title: 'תורכיז כהה' },
    { id: 'ad8673', title: 'חום' },
    { id: '73666b', title: 'חום-סגול' },
    { id: '7acca7', title: 'ירוק בהיר' },
  ]);
  const [showColorManager, setShowColorManager] = useState(false);
  const [newColorHex, setNewColorHex] = useState('#782138');
  const [newColorTitle, setNewColorTitle] = useState('');
  const [savingColors, setSavingColors] = useState(false);
  
  // Split video caption mode setting
  const [splitVideoCaptionMode, setSplitVideoCaptionMode] = useState('first'); // 'first' or 'all'
  const [savingCaptionMode, setSavingCaptionMode] = useState(false);

  // Contacts cache sync
  const [refreshingContacts, setRefreshingContacts] = useState(false);
  const [contactsSyncResult, setContactsSyncResult] = useState(null);
  const [importedModalOpen, setImportedModalOpen] = useState(false);
  const [importedTotal, setImportedTotal] = useState(null);
  // Per-authorized-sender imported contacts modal (null = closed, or {id, label})
  const [senderImportedModal, setSenderImportedModal] = useState(null);
  
  // Add number modal
  const [showAddNumber, setShowAddNumber] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newNumberName, setNewNumberName] = useState('');
  
  // Status details modal state
  const [statusDetailsModal, setStatusDetailsModal] = useState({
    show: false,
    status: null,
    views: [],
    reactions: [],
    replies: [],
    loading: false,
    activeTab: 'content' // 'content' | 'views' | 'reactions' | 'replies'
  });
  
  // Scheduled status details modal
  const [scheduledDetailsModal, setScheduledDetailsModal] = useState({
    show: false,
    item: null,
    editMode: false,
    newScheduleDate: '',
    newScheduleTime: ''
  });
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    title: '',
    message: '',
    onConfirm: null,
    confirmText: 'אישור',
    danger: false
  });

  const showConfirm = (title, message, onConfirm, options = {}) => {
    setConfirmModal({
      show: true,
      title,
      message,
      onConfirm,
      confirmText: options.confirmText || 'אישור',
      danger: options.danger || false
    });
  };

  const hideConfirm = () => {
    setConfirmModal(prev => ({ ...prev, show: false }));
  };

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login?redirect=/status-bot/dashboard');
      return;
    }
    
    fetchMe();
    checkSubscriptionFirst();
    loadAvailableColors();
  }, []);

  // Real-time status updates via Socket.io
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || window.location.origin, {
      auth: { token }
    });

    socket.on('statusbot_status', (data) => {
      console.log('[StatusBot] Real-time status update:', data.status);
      
      if (data.status === 'connected') {
        setConnection(prev => prev ? { ...prev, connection_status: 'connected' } : null);
        if (step === 'qr' || step === 'loading') {
          setStep('dashboard');
          loadDashboardData();
          toast.success('חיבור הווצאפ הושלם בהצלחה!');
        }
      } else if (data.status === 'disconnected' || data.status === 'failed') {
        setConnection(prev => prev ? { ...prev, connection_status: data.status } : null);
        if (step === 'dashboard') {
          toast.error('חיבור הווצאפ התנתק');
        }
      } else if (data.status === 'qr_pending') {
        setConnection(prev => prev ? { ...prev, connection_status: 'qr_pending' } : null);
        if (step !== 'qr') {
          setStep('qr');
          fetchQR();
        }
      }
    });
    
    // Uncertain status revealed (first view after 500 error)
    socket.on('statusbot:status_revealed', (data) => {
      if (data.status) {
        setStatuses(prev => {
          const exists = prev.some(s => s.id === data.status.id);
          if (exists) return prev;
          return [data.status, ...prev];
        });
      }
    });

    // Real-time pending status updates
    socket.on('statusbot:pending_update', (data) => {
      console.log('[StatusBot] Pending status update:', data);
      if ((data.action === 'new' || data.action === 'add') && data.status) {
        const newStatusId = data.status.id || data.status.statusId || data.statusId;
        setPendingStatuses(prev => {
          const exists = prev.some(p => (p.id || p.statusId) === newStatusId);
          if (exists) {
            return prev.map(p => (p.id || p.statusId) === newStatusId ? { ...data.status, id: newStatusId } : p);
          }
          return [{ ...data.status, id: newStatusId }, ...prev];
        });
      } else if (data.action === 'removed' && data.statusId) {
        setPendingStatuses(prev => prev.filter(p => (p.id || p.statusId) !== data.statusId));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [step]);

  // Poll in-progress statuses every 5 seconds when there are processing items
  // Fetch imported-contacts total when entering contacts format
  useEffect(() => {
    if (step !== 'dashboard') return;
    if (connection?.status_send_format === 'contacts') {
      loadImportedTotal();
    } else {
      setImportedTotal(null);
    }
  }, [step, connection?.status_send_format, importedModalOpen]);

  useEffect(() => {
    if (step !== 'dashboard') return;
    const hasProcessing = inProgressStatuses.some(s => s.queue_status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/status-bot/in-progress');
        setInProgressStatuses(res.data.inProgress || []);
        // If no more processing items, reload full dashboard
        const stillProcessing = (res.data.inProgress || []).some(s => s.queue_status === 'processing');
        if (!stillProcessing) loadDashboardData();
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [step, JSON.stringify(inProgressStatuses.map(s => s.id + s.queue_status))]);

  // Load available colors from settings
  const loadAvailableColors = async () => {
    try {
      const { data } = await api.get('/status-bot/colors');
      if (data.colors && data.colors.length > 0) {
        setAvailableColors(data.colors);
        // Set default color to first available
        setBackgroundColor('#' + data.colors[0].id);
      }
    } catch (err) {
      console.log('Failed to load colors, using defaults');
    }
  };

  // Color management functions
  const addColor = () => {
    if (!newColorHex || !newColorTitle.trim()) {
      toast.error('נא להזין שם וצבע');
      return;
    }
    if (availableColors.length >= 10) {
      toast.error('מקסימום 10 צבעים');
      return;
    }
    
    const hexId = newColorHex.replace('#', '').toLowerCase();
    if (availableColors.some(c => c.id === hexId)) {
      toast.error('צבע זה כבר קיים');
      return;
    }
    
    setAvailableColors([...availableColors, { id: hexId, title: newColorTitle.trim() }]);
    setNewColorHex('#782138');
    setNewColorTitle('');
  };

  const removeColor = (colorId) => {
    if (availableColors.length <= 1) {
      toast.error('חייב להישאר לפחות צבע אחד');
      return;
    }
    setAvailableColors(availableColors.filter(c => c.id !== colorId));
    // If current color was removed, switch to first available
    if (backgroundColor === '#' + colorId) {
      const remaining = availableColors.filter(c => c.id !== colorId);
      if (remaining.length > 0) {
        setBackgroundColor('#' + remaining[0].id);
      }
    }
  };

  const saveColors = async () => {
    try {
      setSavingColors(true);
      await api.put('/status-bot/colors', { colors: availableColors });
      toast.success('הצבעים נשמרו');
      setShowColorManager(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בשמירת צבעים');
    } finally {
      setSavingColors(false);
    }
  };

  const updateCaptionMode = async (mode) => {
    try {
      setSavingCaptionMode(true);
      await api.patch('/status-bot/settings', { split_video_caption_mode: mode });
      setSplitVideoCaptionMode(mode);
      toast.success('ההגדרה נשמרה');
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בשמירת הגדרה');
    } finally {
      setSavingCaptionMode(false);
    }
  };

  const handleRefreshContacts = async () => {
    setRefreshingContacts(true);
    setContactsSyncResult(null);
    try {
      const { data } = await api.post('/status-bot/contacts/refresh');
      setContactsSyncResult({ count: data.count, synced_at: data.synced_at });
      setConnection(prev => prev ? { ...prev, contacts_cache_count: data.count, contacts_cache_synced_at: data.synced_at } : prev);
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בסנכרון אנשי הקשר');
    } finally {
      setRefreshingContacts(false);
    }
  };

  const loadImportedTotal = async () => {
    try {
      const { data } = await api.get('/status-bot/imported-contacts');
      setImportedTotal({ total: data.total, enabled: data.use_imported_contacts !== false });
    } catch {}
  };

  const DEFAULT_COLORS = [
    { id: '782138', title: 'בורדו' },
    { id: '6e267d', title: 'סגול כהה' },
    { id: '8d698f', title: 'סגול לילך' },
    { id: 'c79ecc', title: 'סגול בהיר' },
    { id: '8294c9', title: 'כחול אפרפר' },
    { id: '7d8fa3', title: 'אפור' },
    { id: '243740', title: 'תורכיז כהה' },
    { id: 'ad8673', title: 'חום' },
    { id: '73666b', title: 'חום-סגול' },
    { id: '7acca7', title: 'ירוק בהיר' },
  ];

  const resetColors = async () => {
    try {
      setSavingColors(true);
      await api.delete('/status-bot/colors');
      setAvailableColors(DEFAULT_COLORS);
      toast.success('הצבעים אופסו לברירת מחדל');
      setShowColorManager(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה באיפוס צבעים');
    } finally {
      setSavingColors(false);
    }
  };
  
  // First check if user has an active subscription
  const checkSubscriptionFirst = async () => {
    try {
      const { data } = await api.get('/services/access/status-bot');
      if (!data.hasAccess) {
        setStep('no_subscription');
        setLoading(false);
        return;
      }
      setSubscription(data.subscription);
      // Has subscription - proceed with normal flow
      fetchMainStatus();
      checkStatus();
    } catch (err) {
      console.error('Subscription check error:', err);
      setStep('no_subscription');
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    try {
      setStep('loading');
      
      // Simply check our DB connection status - trust the webhooks to keep it updated
      const { data } = await api.get('/status-bot/connection');
      
      if (data.connection?.connection_status === 'connected') {
        // Connected in DB - show dashboard immediately
        setConnection(data.connection);
        if (data.connection?.split_video_caption_mode) {
          setSplitVideoCaptionMode(data.connection.split_video_caption_mode);
        }
        if (data.subscription) setSubscription(data.subscription);
        setStep('dashboard');
        loadDashboardData();
      } else if (data.connection?.connection_status === 'qr_pending') {
        // QR pending - show QR page
        setConnection(data.connection);
        setStep('qr');
        fetchQR();
      } else {
        // Not connected or no connection record - show select page
        setStep('select');
        // Check for existing session only when showing select page
        checkExisting();
      }
    } catch (err) {
      console.error('Check status error:', err);
      setStep('select');
      checkExisting();
    } finally {
      setLoading(false);
    }
  };

  const checkExisting = async () => {
    try {
      const { data } = await api.get('/status-bot/check-existing');
      setExistingSession(data);
      return data;
    } catch (err) {
      setExistingSession({ exists: false });
      return { exists: false };
    }
  };

  const loadDashboardData = async () => {
    try {
      const [numbersRes, historyRes, queueRes, pendingRes, failedRes, inProgressRes] = await Promise.all([
        api.get('/status-bot/authorized-numbers'),
        api.get('/status-bot/history?limit=20'),
        api.get('/status-bot/queue'),
        api.get('/status-bot/pending-statuses').catch(() => ({ data: { pendingStatuses: [] } })),
        api.get('/status-bot/failed').catch(() => ({ data: { failedStatuses: [] } })),
        api.get('/status-bot/in-progress').catch(() => ({ data: { inProgress: [] } })),
      ]);
      
      setAuthorizedNumbers(numbersRes.data.numbers || []);
      setStatuses(historyRes.data.statuses || []);
      setQueue(queueRes.data.queue || []);
      setScheduled(queueRes.data.scheduled || []);
      setPendingStatuses(pendingRes.data.pendingStatuses || []);
      setFailedStatuses(failedRes.data.failedStatuses || []);
      setInProgressStatuses(inProgressRes.data.inProgress || []);
    } catch (err) {
      console.error('Load dashboard data error:', err);
    }
  };

  const fetchStatusDetails = async (statusId, initialTab = 'views') => {
    setStatusDetailsModal(prev => ({ ...prev, show: true, loading: true, activeTab: initialTab }));
    try {
      const { data } = await api.get(`/status-bot/status/${statusId}/details`);
      setStatusDetailsModal(prev => ({
        ...prev,
        status: data.status,
        views: data.views || [],
        reactions: data.reactions || [],
        replies: data.replies || [],
        loading: false
      }));
    } catch (err) {
      console.error('Fetch status details error:', err);
      setStatusDetailsModal(prev => ({ ...prev, show: false, loading: false }));
      toast.error('שגיאה בטעינת פרטי סטטוס');
    }
  };

  const closeStatusDetailsModal = () => {
    setStatusDetailsModal({
      show: false,
      status: null,
      views: [],
      reactions: [],
      replies: [],
      loading: false,
      activeTab: 'content'
    });
  };

  const fetchConnection = async () => {
    try {
      const { data } = await api.get('/status-bot/connection');
      if (data.connection) {
        setConnection(data.connection);
      }
      if (data.subscription) {
        setSubscription(data.subscription);
      }
      return data;
    } catch (err) {
      console.error('Fetch connection error:', err);
      return null;
    }
  };

  const handleConnect = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { data } = await api.post('/status-bot/connect');
      setConnection(data.connection);
      
      if (data.connection?.connection_status === 'connected') {
        setStep('dashboard');
        loadDashboardData();
      } else {
        setStep('qr');
        fetchQR();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בחיבור');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQR = async () => {
    try {
      const { data } = await api.get('/status-bot/qr');
      
      if (data.status === 'connected') {
        // Get connection details
        const connRes = await api.get('/status-bot/connection');
        setConnection(connRes.data.connection);
        setStep('dashboard');
        loadDashboardData();
        return;
      }
      
      if (data.status === 'need_connect') {
        // Session doesn't exist - trigger connection
        console.log('[StatusBot] Session not found, triggering connection...');
        await handleConnect();
        return;
      }
      
      if (data.status === 'not_started') {
        setError(data.message);
        setStep('select');
        return;
      }
      
      if (data.qr) {
        setQrCode(data.qr);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בקבלת QR');
    }
  };

  const handleRefreshQR = async () => {
    try {
      const data = await fetchConnection();
      if (data?.connection?.connection_status === 'connected') {
        setStep('dashboard');
        loadDashboardData();
      } else {
        await fetchQR();
      }
    } catch (err) {
      console.error('Refresh QR error:', err);
    }
  };

  const handleDisconnect = async () => {
    showConfirm(
      'ניתוק WhatsApp',
      'האם אתה בטוח שברצונך לנתק את החיבור?',
      async () => {
        hideConfirm();
        setIsLoading(true);
        try {
          await api.post('/status-bot/disconnect');
          setConnection(null);
          setStep('select');
          setIsCheckingExisting(true);
          await checkExisting();
          setIsCheckingExisting(false);
        } catch (err) {
          setError(err.response?.data?.error || 'שגיאה בניתוק');
        } finally {
          setIsLoading(false);
        }
      },
      { confirmText: 'נתק', danger: true }
    );
  };

  const handleUploadStatus = async () => {
    if (statusType === 'text' && !textContent.trim()) {
      toast.warning('נא להזין טקסט');
      return;
    }
    if (statusType !== 'text' && !mediaUrl.trim() && !mediaFile) {
      toast.warning('נא להזין URL או להעלות קובץ');
      return;
    }
    if (scheduleMode === 'schedule' && (!scheduleDate || !scheduleTime)) {
      toast.warning('נא לבחור תאריך ושעה לתזמון');
      return;
    }

    setUploading(true);
    try {
      let endpoint;
      let body;
      let useFormData = false;
      
      // Calculate scheduled_for if scheduling
      let scheduledFor = null;
      if (scheduleMode === 'schedule') {
        scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      }

      // If file is uploaded, use FormData
      if (mediaFile && statusType !== 'text') {
        useFormData = true;
        const formData = new FormData();
        formData.append('file', mediaFile);
        if (caption) formData.append('caption', caption);
        if (statusType === 'voice') formData.append('backgroundColor', backgroundColor);
        if (scheduledFor) formData.append('scheduled_for', scheduledFor);
        
        endpoint = `/status-bot/status/${statusType}`;
        body = formData;
      } else {
        switch (statusType) {
          case 'text':
            endpoint = '/status-bot/status/text';
            body = { text: textContent, backgroundColor, scheduled_for: scheduledFor };
            break;
          case 'image':
            endpoint = '/status-bot/status/image';
            body = { url: mediaUrl, caption, scheduled_for: scheduledFor };
            break;
          case 'video':
            endpoint = '/status-bot/status/video';
            body = { url: mediaUrl, caption, scheduled_for: scheduledFor };
            break;
          case 'voice':
            endpoint = '/status-bot/status/voice';
            body = { url: mediaUrl, backgroundColor, scheduled_for: scheduledFor };
            break;
        }
      }

      // Handle video split with multiple parts
      if (statusType === 'video' && videoSplitInfo?.needsSplit && mediaFile) {
        // First split the video to get actual URLs
        const splitFormData = new FormData();
        splitFormData.append('file', mediaFile);
        const splitResponse = await api.post('/status-bot/video/split', splitFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        // Build parts array with captions
        const parts = splitResponse.data.parts.map((part, index) => ({
          url: part.url,
          caption: videoPartCaptions[index] || ''
        }));
        
        // Send with parts
        await api.post('/status-bot/status/video', {
          parts: JSON.stringify(parts),
          scheduled_for: scheduledFor
        });
      } else if (useFormData) {
        await api.post(endpoint, body, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.post(endpoint, body);
      }
      
      // Reset form
      setTextContent('');
      setMediaUrl('');
      setCaption('');
      setMediaFile(null);
      setMediaInputMode('file');
      setScheduleMode('now');
      setScheduleDate('');
      setScheduleTime('');
      setVideoSplitInfo(null);
      setVideoPartCaptions([]);
      if (recordedAudio) {
        URL.revokeObjectURL(recordedAudio);
        setRecordedAudio(null);
      }
      
      loadDashboardData();
      const partMsg = videoSplitInfo?.needsSplit ? ` (${videoSplitInfo.partCount} חלקים)` : '';
      toast.success(scheduleMode === 'schedule' ? `הסטטוס תוזמן בהצלחה!${partMsg}` : `הסטטוס נוסף לתור!${partMsg}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בהעלאת סטטוס');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        toast.error('הקובץ גדול מדי. גודל מקסימלי: 100MB');
        return;
      }
      setMediaFile(file);
      setMediaUrl('');
      setVideoSplitInfo(null);
      setVideoPartCaptions([]);
      
      // Analyze video for potential splitting
      if (statusType === 'video' && file.type.startsWith('video/')) {
        setAnalyzingVideo(true);
        try {
          const formData = new FormData();
          formData.append('file', file);
          const response = await api.post('/status-bot/video/analyze', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          if (response.data.needsSplit) {
            setVideoSplitInfo(response.data);
            // Initialize captions array (first part gets the main caption, rest empty)
            const captions = Array(response.data.partCount).fill('');
            setVideoPartCaptions(captions);
            toast.info(`הסרטון יחולק ל-${response.data.partCount} חלקים (~${response.data.formattedPartDuration} כל חלק)`);
          }
        } catch (err) {
          console.log('Video analysis skipped:', err.message);
        } finally {
          setAnalyzingVideo(false);
        }
      }
    }
  };

  const startRecording = async () => {
    try {
      // Clear previous recording
      setRecordedAudio(null);
      setMediaFile(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
        setMediaFile(file);
        
        // Create URL for playback
        const audioUrl = URL.createObjectURL(blob);
        setRecordedAudio(audioUrl);
        
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      toast.error('לא ניתן לגשת למיקרופון');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };
  
  const clearRecording = () => {
    if (recordedAudio) {
      URL.revokeObjectURL(recordedAudio);
    }
    setRecordedAudio(null);
    setMediaFile(null);
  };

  const handleAddNumber = async () => {
    if (!newNumber.trim()) return;
    
    try {
      await api.post('/status-bot/authorized-numbers', {
        phoneNumber: newNumber,
        name: newNumberName || null
      });
      
      setNewNumber('');
      setNewNumberName('');
      setShowAddNumber(false);
      loadDashboardData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בהוספת מספר');
    }
  };

  const handleRemoveNumber = async (numberId) => {
    showConfirm(
      'הסרת מספר מורשה',
      'האם להסיר את המספר מרשימת המספרים המורשים?',
      async () => {
        hideConfirm();
        try {
          await api.delete(`/status-bot/authorized-numbers/${numberId}`);
          loadDashboardData();
          toast.success('המספר הוסר');
        } catch (err) {
          toast.error(err.response?.data?.error || 'שגיאה במחיקת מספר');
        }
      },
      { confirmText: 'הסר', danger: true }
    );
  };

  const handleToggleCanImport = async (numberId, current) => {
    const next = !current;
    // optimistic update so the toggle feels instant
    setAuthorizedNumbers(prev => prev.map(n => n.id === numberId ? { ...n, can_import_contacts: next } : n));
    try {
      await api.patch(`/status-bot/authorized-numbers/${numberId}/can-import`, {
        can_import_contacts: next,
      });
      toast.success(next ? 'הרשאה הופעלה — המשתמש יכול להוסיף אנשי קשר' : 'הרשאה הושבתה');
    } catch (err) {
      // revert
      setAuthorizedNumbers(prev => prev.map(n => n.id === numberId ? { ...n, can_import_contacts: current } : n));
      toast.error(err.response?.data?.error || 'שגיאה בעדכון הרשאה');
    }
  };

  const handleDeleteStatus = async (statusId) => {
    showConfirm(
      'מחיקת סטטוס',
      'האם אתה בטוח שברצונך למחוק את הסטטוס? הפעולה תסיר את הסטטוס גם מהווצאפ.',
      async () => {
        hideConfirm();
        try {
          await api.delete(`/status-bot/status/${statusId}`);
          // Update local state to mark as deleted instead of removing
          setStatuses(prev => prev.map(s => 
            s.id === statusId ? { ...s, is_deleted: true, deleted_at: new Date().toISOString() } : s
          ));
          toast.success('הסטטוס נמחק');
        } catch (err) {
          toast.error(err.response?.data?.error || 'שגיאה במחיקת סטטוס');
        }
      },
      { confirmText: 'מחק סטטוס', danger: true }
    );
  };

  const handleCancelScheduled = async (queueId) => {
    showConfirm(
      'ביטול תזמון',
      'האם אתה בטוח שברצונך לבטל את התזמון?',
      async () => {
        hideConfirm();
        try {
          await api.delete(`/status-bot/queue/${queueId}`);
          setScheduled(prev => prev.filter(s => s.id !== queueId));
          toast.success('התזמון בוטל');
        } catch (err) {
          toast.error(err.response?.data?.error || 'שגיאה בביטול תזמון');
        }
      },
      { confirmText: 'בטל תזמון', danger: true }
    );
  };

  const handleSendScheduledNow = async (queueId) => {
    showConfirm(
      'שליחה מיידית',
      'האם לשלוח את הסטטוס עכשיו?',
      async () => {
        hideConfirm();
        try {
          await api.post(`/status-bot/queue/${queueId}/send-now`);
          setScheduled(prev => prev.filter(s => s.id !== queueId));
          toast.success('הסטטוס נשלח');
          fetchQueueStatus();
        } catch (err) {
          toast.error(err.response?.data?.error || 'שגיאה בשליחת הסטטוס');
        }
      },
      { confirmText: 'שלח עכשיו' }
    );
  };

  const handleReschedule = async (queueId, newDate, newTime) => {
    try {
      const scheduledFor = new Date(`${newDate}T${newTime}:00`);
      await api.patch(`/status-bot/queue/${queueId}`, { scheduled_for: scheduledFor.toISOString() });
      setScheduledDetailsModal(prev => ({ ...prev, show: false, editMode: false }));
      toast.success('התזמון עודכן');
      fetchQueueStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בעדכון התזמון');
    }
  };

  const handleCancelQueueItem = async (queueId) => {
    try {
      await api.delete(`/status-bot/queue/${queueId}`);
      setQueue(prev => prev.filter(q => q.id !== queueId));
      toast.success('הוסר מהתור');
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בהסרה מהתור');
    }
  };

  const handleReorderQueue = async (itemId, direction) => {
    try {
      const { data } = await api.post('/status-bot/queue/reorder', { itemId, direction });
      if (data.changed) fetchQueueStatus();
    } catch (err) {
      toast.error('שגיאה בשינוי סדר');
    }
  };

  const isConnected = connection?.connection_status === 'connected';
  const isRestricted = connection?.isRestricted;
  
  // Timer states for countdown displays
  const [restrictionCountdown, setRestrictionCountdown] = useState(null);
  const [subscriptionCountdown, setSubscriptionCountdown] = useState(null);

  const clearError = () => setError(null);
  
  // Countdown timer for restriction and subscription expiry
  useEffect(() => {
    const updateCountdowns = () => {
      // Restriction countdown
      if (connection?.restrictionEndsAt) {
        const end = new Date(connection.restrictionEndsAt);
        const now = new Date();
        const diff = end - now;
        
        if (diff > 0) {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setRestrictionCountdown({ hours, minutes, seconds });
        } else {
          setRestrictionCountdown(null);
          // Restriction ended - refresh connection data
          fetchConnection();
        }
      } else {
        setRestrictionCountdown(null);
      }
      
      // Subscription expiry countdown (for cancelled or trial subscriptions)
      const endDate = subscription?.status === 'trial' 
        ? (subscription?.trial_ends_at || subscription?.current_period_end)
        : subscription?.status === 'cancelled' 
          ? subscription?.expiresAt 
          : null;
          
      if ((subscription?.status === 'cancelled' || subscription?.status === 'trial') && endDate) {
        const end = new Date(endDate);
        const now = new Date();
        const diff = end - now;
        
        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          setSubscriptionCountdown({ days, hours, minutes });
        } else {
          setSubscriptionCountdown(null);
          // Subscription ended - check access again
          if (subscription?.status === 'cancelled') {
            checkSubscriptionFirst();
          }
        }
      } else {
        setSubscriptionCountdown(null);
      }
    };
    
    updateCountdowns();
    const interval = setInterval(updateCountdowns, 1000);
    return () => clearInterval(interval);
  }, [connection?.restrictionEndsAt, subscription]);
  
  // Polling for real-time updates when on dashboard
  useEffect(() => {
    if (step !== 'dashboard') return;
    
    const pollInterval = setInterval(async () => {
      try {
        // Fetch queue, history and in-progress updates
        const [historyRes, queueRes, inProgressRes] = await Promise.all([
          api.get('/status-bot/history?limit=20'),
          api.get('/status-bot/queue'),
          api.get('/status-bot/in-progress').catch(() => ({ data: { inProgress: [] } })),
        ]);
        
        // Update statuses while preserving deleted state
        setStatuses(prev => {
          const newStatuses = historyRes.data.statuses || [];
          return newStatuses.map(newStatus => {
            const oldStatus = prev.find(s => s.id === newStatus.id);
            if (oldStatus?.is_deleted) {
              return { ...newStatus, is_deleted: true, deleted_at: oldStatus.deleted_at };
            }
            return newStatus;
          });
        });
        
        setQueue(queueRes.data.queue || []);
        setInProgressStatuses(inProgressRes.data.inProgress || []);
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 5000); // Poll every 5 seconds
    
    return () => clearInterval(pollInterval);
  }, [step]);

  // Loading screen
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">בודק סטטוס חיבור...</p>
        </div>
      </div>
    );
  }

  // No subscription - redirect to landing
  if (step === 'no_subscription') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50" dir="rtl">
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
                  onClick={() => { logout(); navigate('/login'); }}
                  className="hidden md:block px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
                >
                  התנתק
                </button>
              </div>
            </div>
          </div>
        </header>
        
        <main className="max-w-4xl mx-auto px-6 py-12">
          <div className="text-center mb-12">
            <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
              <Upload className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">בוט העלאת סטטוסים</h1>
            <p className="text-xl text-gray-500 mb-2">העלה סטטוסים בקלות מהאתר או מ-WhatsApp</p>
            <p className="text-gray-400">ללא הגבלה, עם סטטיסטיקות מלאות</p>
          </div>
          
          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Upload className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">העלאה מהירה</h3>
              <p className="text-gray-500 text-sm">העלה סטטוסים ישירות מהאתר - טקסט, תמונות, סרטונים והקלטות</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">שליחה מ-WhatsApp</h3>
              <p className="text-gray-500 text-sm">שלח הודעה לבוט והיא תעלה כסטטוס אוטומטית</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <BarChart className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">סטטיסטיקות</h3>
              <p className="text-gray-500 text-sm">צפה בצפיות, לבבות ותגובות לכל סטטוס בזמן אמת</p>
            </div>
          </div>
          
          {/* Pricing */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-8 text-center max-w-md mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full mb-4">
              <Crown className="w-4 h-4" />
              שירות פרימיום
            </div>
            <div className="mb-6">
              <span className="text-5xl font-bold text-gray-900">₪250</span>
              <span className="text-gray-500">/חודש</span>
            </div>
            <ul className="text-right space-y-3 mb-8">
              <li className="flex items-center gap-3 text-gray-600">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                העלאת סטטוסים ללא הגבלה
              </li>
              <li className="flex items-center gap-3 text-gray-600">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                מספרים מורשים ללא הגבלה
              </li>
              <li className="flex items-center gap-3 text-gray-600">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                סטטיסטיקות מלאות בזמן אמת
              </li>
              <li className="flex items-center gap-3 text-gray-600">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                תמיכה מלאה
              </li>
            </ul>
            <Link
              to="/status-bot/subscribe"
              className="block w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:shadow-lg transition-all text-center"
            >
              הצטרף עכשיו
            </Link>
            <p className="text-sm text-gray-400 mt-4">ביטול בכל עת, ללא התחייבות</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50" dir="rtl">
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
                onClick={() => { logout(); navigate('/login'); }}
                className="hidden md:block px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Connection Flow (select, qr) */}
      {(step === 'select' || step === 'qr') && (
        <main className="max-w-2xl mx-auto px-6 py-12">
          {/* Hero Section */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Upload className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">בוט העלאת סטטוסים</h1>
            <p className="text-gray-500">חבר את WhatsApp שלך כדי להתחיל להעלות סטטוסים</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={clearError} className="mr-auto">
                <X className="w-5 h-5 hover:text-red-900" />
              </button>
            </div>
          )}

          {/* Main Card */}
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            
            {/* Select Connection */}
            {step === 'select' && (
              <div className="p-8">
                <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">התחברות ל-WhatsApp</h2>
                <p className="text-gray-500 text-center mb-8">סרוק קוד QR וחבר את WhatsApp שלך בשניות</p>
                
                {/* Existing Session Alert */}
                {existingSession?.exists && existingSession?.isConnected && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                    <div className="flex items-center gap-3 text-blue-700">
                      <Wifi className="w-5 h-5" />
                      <div>
                        <p className="font-medium">נמצא חיבור קיים!</p>
                        <p className="text-sm text-blue-600">יש לך סשן מחובר ל-WhatsApp. לחץ על "התחבר עכשיו" להתחבר אוטומטית.</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Main Connect Button */}
                  <button
                    onClick={handleConnect}
                    disabled={isLoading}
                    className="w-full p-6 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 border-2 border-green-200 hover:border-green-300 rounded-2xl text-right transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                        <Smartphone className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-bold text-gray-900">התחבר עכשיו</h3>
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">מומלץ</span>
                        </div>
                        <p className="text-gray-500 text-sm mb-3">סרוק קוד QR והתחבר תוך שניות. אנחנו מנהלים הכל.</p>
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                          <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> מהיר</span>
                          <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> מאובטח</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ללא הגדרות</span>
                        </div>
                      </div>
                      <ChevronLeft className="w-5 h-5 text-gray-400 group-hover:text-green-500 transition-colors" />
                    </div>
                  </button>
                </div>
                
                {isCheckingExisting && (
                  <p className="text-center text-sm text-gray-400 mt-4 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    בודק חיבורים קיימים...
                  </p>
                )}
              </div>
            )}

            {/* QR Code Display */}
            {step === 'qr' && (
              <div className="p-8">
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <QrCode className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">סרוק את קוד ה-QR</h2>
                  <p className="text-gray-500 text-sm">פתח את WhatsApp בטלפון &gt; הגדרות &gt; מכשירים מקושרים &gt; קשר מכשיר</p>
                </div>
                
                {/* QR Code */}
                <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 flex items-center justify-center mb-6">
                  {qrCode ? (
                    <div className="relative">
                      <img 
                        src={qrCode} 
                        alt="QR Code" 
                        className="w-64 h-64"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                        <button
                          onClick={handleRefreshQR}
                          className="p-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                        >
                          <RefreshCw className="w-6 h-6" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-64 h-64 flex items-center justify-center flex-col gap-4">
                      <Loader2 className="w-12 h-12 text-green-500 animate-spin" />
                      <p className="text-gray-500 text-sm">טוען קוד QR...</p>
                    </div>
                  )}
                </div>
                
                {/* Tips */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <p className="text-sm text-gray-600 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                    אם הקוד פג תוקף, לחץ על כפתור הריענון. הקוד בתוקף למשך כ-60 שניות.
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={handleRefreshQR}
                    disabled={isLoading}
                    className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    רענן קוד
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="flex-1 py-3 border-2 border-red-200 text-red-600 rounded-xl font-medium hover:bg-red-50 transition-colors"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Help Section */}
          <div className="mt-8 p-6 bg-white rounded-2xl border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <HelpCircle className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">צריכים עזרה?</p>
                <p className="text-sm text-gray-500">אנחנו כאן בשבילכם</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <a 
                href="https://wa.me/972584254229"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                וואטסאפ
              </a>
              <a 
                href="mailto:office@neriyabudraham.co.il"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                <Mail className="w-5 h-5" />
                אימייל
              </a>
            </div>
          </div>
        </main>
      )}

      {/* Dashboard (when connected) */}
      {step === 'dashboard' && (
        <main className="max-w-7xl mx-auto px-6 py-8">
          {/* Trial Period Banner */}
          {subscription?.status === 'trial' && subscriptionCountdown && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-blue-800">🎁 תקופת ניסיון פעילה</p>
                  <p className="text-sm text-blue-600">
                    תקופת הניסיון מסתיימת בעוד: 
                    <span className="font-bold mr-2 tabular-nums">
                      {subscriptionCountdown.days > 0 && `${subscriptionCountdown.days} ימים `}
                      {subscriptionCountdown.hours} שעות {subscriptionCountdown.minutes} דקות
                    </span>
                    {' • '}
                    <span>החיוב יתבצע בתאריך {new Date(subscription.trial_ends_at || subscription.current_period_end).toLocaleDateString('he-IL')}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Subscription Expiry Banner (when cancelled but still in period) */}
          {subscription?.status === 'cancelled' && subscriptionCountdown && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-orange-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-orange-800">המנוי בוטל</p>
                  <p className="text-sm text-orange-600">
                    הגישה שלך תסתיים בעוד: 
                    <span className="font-bold mr-2 tabular-nums">
                      {subscriptionCountdown.days > 0 && `${subscriptionCountdown.days} ימים `}
                      {subscriptionCountdown.hours} שעות {subscriptionCountdown.minutes} דקות
                    </span>
                  </p>
                </div>
              </div>
              <Link
                to="/status-bot/subscribe"
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
              >
                חידוש מנוי
              </Link>
            </div>
          )}

          {/* Restriction Banner */}
          {isRestricted && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-amber-800">
                  {connection?.restrictionType === 'short' 
                    ? 'עדכוני מערכת בתהליך'
                    : 'תקופת המתנה פעילה (24 שעות מההתחברות)'}
                </p>
                <p className="text-sm text-amber-600">
                  {restrictionCountdown ? (
                    <span className="font-bold tabular-nums">
                      זמן שנותר: {restrictionCountdown.hours > 0 ? `${restrictionCountdown.hours} שעות ` : ''}{restrictionCountdown.minutes} דקות {restrictionCountdown.seconds} שניות
                    </span>
                  ) : (
                    connection?.restrictionType === 'short' 
                      ? 'אנא המתן מספר דקות עד לסיום עדכוני המערכת.'
                      : 'יש להמתין 24 שעות מרגע החיבור לפני שניתן להעלות סטטוסים.'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Connection Status */}
          <div className="mb-6">
            <Link
              to="/whatsapp"
              className="block p-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-white">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <Wifi className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">WhatsApp מחובר</h2>
                    <p className="text-white/80 text-sm flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      <span dir="ltr">{formatPhoneNumber(connection?.phone_number)}</span>
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-white/80">
                  <span className="text-sm">ניהול חיבור</span>
                  <ChevronLeft className="w-5 h-5" />
                </div>
              </div>
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={Upload}
              label="בתור"
              value={queue.length}
              color="blue"
            />
            <StatCard
              icon={Check}
              label="נשלחו היום"
              value={statuses.filter(s => {
                const sent = new Date(s.sent_at);
                const today = new Date();
                return sent.toDateString() === today.toDateString();
              }).length}
              color="green"
            />
            <StatCard
              icon={Eye}
              label="צפיות היום"
              value={statuses.reduce((sum, s) => sum + (s.view_count || 0), 0)}
              color="purple"
            />
            <StatCard
              icon={Heart}
              label="לבבות היום"
              value={statuses.reduce((sum, s) => sum + (s.reaction_count || 0), 0)}
              color="red"
            />
          </div>

          {/* Contacts sync block — visible only in contacts format */}
          {connection?.status_send_format === 'contacts' && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-medium text-purple-800">אנשי קשר מסונכרנים מווצאפ</p>
                  <p className="text-sm text-purple-600">
                    {contactsSyncResult
                      ? `✓ ${contactsSyncResult.count.toLocaleString()} אנשי קשר — עודכן זה עתה`
                      : connection.contacts_cache_count
                        ? `${connection.contacts_cache_count.toLocaleString()} אנשי קשר${connection.contacts_cache_synced_at ? ` — עודכן ${new Date(connection.contacts_cache_synced_at).toLocaleString('he-IL')}` : ''}`
                        : 'לא סונכרן עדיין'
                    }
                  </p>
                </div>
                <button
                  onClick={handleRefreshContacts}
                  disabled={refreshingContacts}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
                >
                  {refreshingContacts ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  רענן רשימה
                </button>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2 border-t border-purple-200 pt-3">
                <div>
                  <p className="font-medium text-purple-800 flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    אנשי קשר מיובאים ידנית
                  </p>
                  <p className="text-sm text-purple-600">
                    {importedTotal
                      ? `${importedTotal.total.toLocaleString()} אנשי קשר ברשימה${importedTotal.enabled ? ' — בשימוש פעיל' : ' — מושבת'}`
                      : 'העלאת רשימה מ-CSV / VCF / טקסט ידני'}
                  </p>
                </div>
                <button
                  onClick={() => setImportedModalOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                >
                  <Upload className="w-4 h-4" />
                  ניהול רשימה
                </button>
              </div>
            </div>
          )}

          <ImportedContactsModal
            isOpen={importedModalOpen}
            onClose={() => setImportedModalOpen(false)}
          />

          {/* Per-authorized-sender imported contacts modal */}
          <ImportedContactsModal
            isOpen={!!senderImportedModal}
            onClose={() => { setSenderImportedModal(null); loadDashboardData(); }}
            authorizedNumberId={senderImportedModal?.id || null}
            senderLabel={senderImportedModal?.label || null}
          />

          {/* Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            <TabButton 
              active={activeTab === 'upload'} 
              onClick={() => setActiveTab('upload')}
              icon={Upload}
              label="העלאת סטטוס"
            />
            {pendingStatuses.length > 0 && (
              <TabButton 
                active={activeTab === 'pending'} 
                onClick={() => setActiveTab('pending')}
                icon={AlertCircle}
                label={`ממתינים (${pendingStatuses.length})`}
                highlight={true}
              />
            )}
            <TabButton 
              active={activeTab === 'history'} 
              onClick={() => setActiveTab('history')}
              icon={List}
              label="היסטוריה"
            />
            <TabButton 
              active={activeTab === 'scheduled'} 
              onClick={() => setActiveTab('scheduled')}
              icon={Clock}
              label={`מתוזמנים ${scheduled.length > 0 ? `(${scheduled.length})` : ''}`}
            />
            <TabButton
              active={activeTab === 'numbers'}
              onClick={() => setActiveTab('numbers')}
              icon={Users}
              label={`מספרים מורשים ${authorizedNumbers.length > 0 ? `(${authorizedNumbers.length})` : ''}`}
            />
            <TabButton
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              icon={Settings}
              label="הגדרות"
            />
            {(failedStatuses.length > 0 || inProgressStatuses.length > 0) && (
              <TabButton 
                active={activeTab === 'failed'} 
                onClick={() => setActiveTab('failed')}
                icon={inProgressStatuses.length > 0 ? Loader2 : AlertCircle}
                label={`תור ${inProgressStatuses.length > 0 ? `(${inProgressStatuses.length})` : ''} ${failedStatuses.length > 0 ? `/ נכשלו (${failedStatuses.length})` : ''}`}
                highlight={failedStatuses.length > 0}
              />
            )}
          </div>

          {/* Tab Content */}
          {activeTab === 'upload' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">העלאת סטטוס חדש</h3>
              
              {isRestricted ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>יש להמתין לסיום תקופת ההמתנה</p>
                </div>
              ) : (
                <>
                  {/* Status Type Selector */}
                  <div className="flex gap-2 mb-6">
                    <TypeButton 
                      active={statusType === 'text'} 
                      onClick={() => setStatusType('text')}
                      icon={Type}
                      label="טקסט"
                    />
                    <TypeButton 
                      active={statusType === 'image'} 
                      onClick={() => setStatusType('image')}
                      icon={Image}
                      label="תמונה"
                    />
                    <TypeButton 
                      active={statusType === 'video'} 
                      onClick={() => setStatusType('video')}
                      icon={Video}
                      label="וידאו"
                    />
                    <TypeButton 
                      active={statusType === 'voice'} 
                      onClick={() => setStatusType('voice')}
                      icon={Mic}
                      label="שמע"
                    />
                  </div>

                  {/* Form based on type */}
                  {statusType === 'text' ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">טקסט</label>
                        <textarea
                          value={textContent}
                          onChange={(e) => setTextContent(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          rows={4}
                          placeholder="הקלד את הטקסט לסטטוס..."
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-medium text-gray-700">צבע רקע</label>
                          <button
                            onClick={() => setShowColorManager(true)}
                            className="text-xs text-green-600 hover:text-green-700"
                          >
                            ניהול צבעים
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={backgroundColor}
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            className="w-12 h-12 rounded-xl cursor-pointer border-2 border-gray-200"
                          />
                          <div className="flex gap-2 flex-wrap">
                            {availableColors.map(colorObj => {
                              const color = '#' + colorObj.id;
                              return (
                                <button
                                  key={colorObj.id}
                                  onClick={() => setBackgroundColor(color)}
                                  title={colorObj.title}
                                  className={`w-8 h-8 rounded-lg ${backgroundColor === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                                  style={{ backgroundColor: color }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Input Mode Selector */}
                      <div className="flex gap-2 mb-4">
                        <button
                          onClick={() => { setMediaInputMode('file'); setMediaUrl(''); }}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                            mediaInputMode === 'file' 
                              ? 'bg-green-100 text-green-700 border-2 border-green-500' 
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-2 border-transparent'
                          }`}
                        >
                          העלאת קובץ
                        </button>
                        <button
                          onClick={() => { setMediaInputMode('url'); setMediaFile(null); }}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                            mediaInputMode === 'url' 
                              ? 'bg-green-100 text-green-700 border-2 border-green-500' 
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-2 border-transparent'
                          }`}
                        >
                          קישור URL
                        </button>
                        {statusType === 'voice' && (
                          <button
                            onClick={() => { setMediaInputMode('record'); setMediaUrl(''); setMediaFile(null); }}
                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                              mediaInputMode === 'record' 
                                ? 'bg-green-100 text-green-700 border-2 border-green-500' 
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-2 border-transparent'
                            }`}
                          >
                            הקלטה
                          </button>
                        )}
                      </div>

                      {/* URL Input */}
                      {mediaInputMode === 'url' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            URL של {statusType === 'image' ? 'תמונה' : statusType === 'video' ? 'וידאו' : 'קובץ שמע'}
                          </label>
                          <input
                            type="url"
                            value={mediaUrl}
                            onChange={(e) => setMediaUrl(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder="https://..."
                            dir="ltr"
                          />
                          <p className="text-xs text-gray-500 mt-1">גודל מקסימלי: 100MB</p>
                        </div>
                      )}

                      {/* File Upload */}
                      {mediaInputMode === 'file' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            העלאת {statusType === 'image' ? 'תמונה' : statusType === 'video' ? 'וידאו' : 'קובץ שמע'}
                          </label>
                          <div className="relative">
                            <input
                              type="file"
                              accept={
                                statusType === 'image' ? 'image/*' :
                                statusType === 'video' ? 'video/*' :
                                'audio/*'
                              }
                              onChange={handleFileChange}
                              className="hidden"
                              id="media-file-input"
                            />
                            <label
                              htmlFor="media-file-input"
                              className="flex items-center justify-center gap-2 w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-green-500 hover:bg-green-50 transition-colors"
                            >
                              {mediaFile ? (
                                <div className="text-center">
                                  <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                  <p className="font-medium text-gray-700">{mediaFile.name}</p>
                                  <p className="text-sm text-gray-500">{(mediaFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                                </div>
                              ) : (
                                <div className="text-center">
                                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                  <p className="font-medium text-gray-600">לחץ לבחירת קובץ</p>
                                  <p className="text-sm text-gray-400">גודל מקסימלי: 100MB</p>
                                </div>
                              )}
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Voice Recording */}
                      {mediaInputMode === 'record' && statusType === 'voice' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">הקלטת שמע</label>
                          <div className="flex flex-col items-center gap-4 py-6 border-2 border-dashed border-gray-300 rounded-xl">
                            {recordedAudio ? (
                              <div className="text-center w-full px-4">
                                <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
                                <p className="font-medium text-gray-700 mb-4">הקלטה שמורה</p>
                                
                                {/* Audio Playback */}
                                <audio 
                                  controls 
                                  src={recordedAudio}
                                  className="w-full max-w-xs mx-auto mb-4"
                                />
                                
                                <div className="flex items-center justify-center gap-3">
                                  <button
                                    onClick={clearRecording}
                                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
                                  >
                                    מחק
                                  </button>
                                  <button
                                    onClick={startRecording}
                                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                                  >
                                    <Mic className="w-4 h-4" />
                                    הקלט שוב
                                  </button>
                                </div>
                              </div>
                            ) : isRecording ? (
                              <div className="text-center">
                                <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                                  <Mic className="w-8 h-8 text-white" />
                                </div>
                                <p className="font-medium text-red-600 mb-3">מקליט...</p>
                                <button
                                  onClick={stopRecording}
                                  className="px-6 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
                                >
                                  עצור הקלטה
                                </button>
                              </div>
                            ) : (
                              <div className="text-center">
                                <button
                                  onClick={startRecording}
                                  className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3 hover:bg-green-600 transition-colors"
                                >
                                  <Mic className="w-8 h-8 text-white" />
                                </button>
                                <p className="font-medium text-gray-600">לחץ להתחלת הקלטה</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {(statusType === 'image' || statusType === 'video') && (
                        <div>
                          {/* Video Split Info */}
                          {statusType === 'video' && analyzingVideo && (
                            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
                              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                              <span className="text-blue-700 text-sm">מנתח את הסרטון...</span>
                            </div>
                          )}
                          
                          {statusType === 'video' && videoSplitInfo?.needsSplit && (
                            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                              <div className="flex items-center gap-2 mb-3">
                                <Video className="w-5 h-5 text-amber-600" />
                                <span className="text-amber-800 font-medium">
                                  הסרטון יחולק ל-{videoSplitInfo.partCount} חלקים
                                </span>
                                <span className="text-amber-600 text-sm">
                                  (~{videoSplitInfo.formattedPartDuration} כל חלק)
                                </span>
                              </div>
                              
                              <div className="space-y-3">
                                {videoPartCaptions.map((partCaption, index) => (
                                  <div key={index} className="bg-white p-3 rounded-lg border border-amber-100">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      כיתוב לחלק {index + 1}
                                    </label>
                                    <input
                                      type="text"
                                      value={partCaption}
                                      onChange={(e) => {
                                        const newCaptions = [...videoPartCaptions];
                                        newCaptions[index] = e.target.value;
                                        setVideoPartCaptions(newCaptions);
                                      }}
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                      placeholder={index === 0 ? 'כיתוב ראשי (אופציונלי)' : 'כיתוב נוסף (אופציונלי)'}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Normal caption input (only when not splitting) */}
                          {!(statusType === 'video' && videoSplitInfo?.needsSplit) && (
                            <>
                              <label className="block text-sm font-medium text-gray-700 mb-1">כיתוב (אופציונלי)</label>
                              <textarea
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                                placeholder="כיתוב לסטטוס..."
                              />
                            </>
                          )}
                        </div>
                      )}

                      {statusType === 'voice' && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-700">צבע רקע</label>
                            <button
                              onClick={() => setShowColorManager(true)}
                              className="text-xs text-green-600 hover:text-green-700"
                            >
                              ניהול צבעים
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={backgroundColor}
                              onChange={(e) => setBackgroundColor(e.target.value)}
                              className="w-12 h-12 rounded-xl cursor-pointer border-2 border-gray-200"
                            />
                            <div className="flex gap-2 flex-wrap">
                              {availableColors.map(colorObj => {
                                const color = '#' + colorObj.id;
                                return (
                                  <button
                                    key={colorObj.id}
                                    onClick={() => setBackgroundColor(color)}
                                    title={colorObj.title}
                                    className={`w-8 h-8 rounded-lg ${backgroundColor === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                                    style={{ backgroundColor: color }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scheduling Options - outside the ternary so it shows for all status types */}
                  <div className="pt-4 border-t border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-2">מתי לשלוח?</label>
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setScheduleMode('now')}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          scheduleMode === 'now'
                            ? 'bg-green-100 text-green-700 border-2 border-green-500'
                            : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'
                        }`}
                      >
                        עכשיו
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleMode('schedule')}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          scheduleMode === 'schedule'
                            ? 'bg-green-100 text-green-700 border-2 border-green-500'
                            : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'
                        }`}
                      >
                        <Clock className="w-4 h-4 inline ml-1" />
                        תזמון
                      </button>
                    </div>
                    
                    {scheduleMode === 'schedule' && (
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1">תאריך</label>
                          <input
                            type="date"
                            value={scheduleDate}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1">שעה</label>
                          <input
                            type="time"
                            value={scheduleTime}
                            onChange={(e) => setScheduleTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleUploadStatus}
                    disabled={uploading || (scheduleMode === 'schedule' && (!scheduleDate || !scheduleTime))}
                    className="w-full mt-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        {scheduleMode === 'schedule' ? 'מתזמן...' : 'שולח...'}
                      </>
                    ) : scheduleMode === 'schedule' ? (
                      <>
                        <Clock className="w-5 h-5" />
                        תזמן סטטוס
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        שליחה
                      </>
                    )}
                  </button>

                  {queue.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium text-gray-700">סטטוסים בתור ({queue.length})</p>
                      {queue.map((item, idx) => (
                        <div key={item.id} className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl text-sm">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            item.status === 'processing' ? 'bg-blue-200 animate-pulse' : 'bg-blue-100'
                          }`}>
                            {item.status === 'processing' ? (
                              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                            ) : (
                              <span className="text-blue-600 font-medium">{idx + 1}</span>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-blue-800">
                                {item.status_type === 'text' ? 'טקסט' :
                                 item.status_type === 'image' ? 'תמונה' :
                                 item.status_type === 'video' ? 'סרטון' : 'הקלטה'}
                              </p>
                              <SourceBadge source={item.source} queueId={item.id} />
                            </div>
                            <p className="text-xs text-blue-600">
                              {item.queue_status === 'processing' ? 'שולח עכשיו...' : 'ממתין בתור'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                </>
              )}
            </div>
          )}

          {activeTab === 'pending' && (
            <PendingStatusesTab 
              pendingStatuses={pendingStatuses}
              setPendingStatuses={setPendingStatuses}
              toast={toast}
              loadDashboardData={loadDashboardData}
            />
          )}

          {activeTab === 'history' && (
            <div className="space-y-6">
              {/* Active Statuses - Last 24 Hours */}
              {(() => {
                const now = new Date();
                const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                const activeStatuses = statuses.filter(s => new Date(s.sent_at) > dayAgo);
                const olderStatuses = statuses.filter(s => new Date(s.sent_at) <= dayAgo);
                
                return (
                  <>
                    {/* Active Statuses Section - only show when there are statuses */}
                    {statuses.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-green-50">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            <h3 className="font-bold text-gray-800">סטטוסים פעילים</h3>
                            <span className="text-sm text-gray-500">(24 שעות אחרונות)</span>
                          </div>
                        </div>
                        
                        {activeStatuses.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <Upload className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">אין סטטוסים פעילים כרגע</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {activeStatuses.map(status => (
                              <StatusRow 
                                key={status.id} 
                                status={status}
                                onDelete={() => handleDeleteStatus(status.id)}
                                isActive={true}
                                onShowDetails={fetchStatusDetails}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Older Statuses Section */}
                    {olderStatuses.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <History className="w-4 h-4 text-gray-400" />
                            <h3 className="font-bold text-gray-800">היסטוריה</h3>
                          </div>
                        </div>
                        
                        <div className="divide-y divide-gray-100">
                          {olderStatuses.map(status => (
                            <StatusRow 
                              key={status.id} 
                              status={status}
                              onDelete={() => handleDeleteStatus(status.id)}
                              isActive={false}
                              onShowDetails={fetchStatusDetails}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Empty State */}
                    {statuses.length === 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-500">
                        <Upload className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>עדיין לא העלית סטטוסים</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {activeTab === 'scheduled' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-500" />
                      <h3 className="font-bold text-gray-800">מרכז הפעילות</h3>
                      <span className="text-xs text-gray-400 font-normal">סטטוסים מתוזמנים והיסטוריה</span>
                    </div>
                    <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-0.5">
                      <button
                        onClick={() => setScheduledViewMode('calendar')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          scheduledViewMode === 'calendar' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        לוח
                      </button>
                      <button
                        onClick={() => setScheduledViewMode('list')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          scheduledViewMode === 'list' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        רשימה
                      </button>
                    </div>
                  </div>
                </div>

                {scheduledViewMode === 'calendar' ? (
                  <div className="p-4">
                    <ScheduledCalendar
                      scheduled={scheduled}
                      statuses={statuses}
                      onItemClick={(item) => {
                        if (item._kind === 'scheduled') {
                          setScheduledDetailsModal({ show: true, item });
                        } else {
                          fetchStatusDetails(item.id, 'content');
                        }
                      }}
                      onDayClick={(day) => {
                        const dateStr = day.toISOString().split('T')[0];
                        setScheduleDate(dateStr);
                        setScheduleTime('09:00');
                        setScheduleMode('schedule');
                        setActiveTab('upload');
                      }}
                      onSendNow={handleSendScheduledNow}
                      onCancel={handleCancelScheduled}
                    />
                  </div>
                ) : scheduled.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">אין סטטוסים מתוזמנים</p>
                    <p className="text-xs text-gray-400 mt-1">תזמן סטטוסים מלשונית "העלאת סטטוס"</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {scheduled.map(item => (
                      <div key={item.id} className="p-4 hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          {/* Click to view details */}
                          <button 
                            onClick={() => setScheduledDetailsModal({ show: true, item })}
                            className="flex items-center gap-3 flex-1 text-right"
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              item.status_type === 'text' ? 'bg-purple-100' :
                              item.status_type === 'image' ? 'bg-blue-100' :
                              item.status_type === 'video' ? 'bg-pink-100' : 'bg-green-100'
                            }`}>
                              {item.status_type === 'text' && <Type className="w-5 h-5 text-purple-600" />}
                              {item.status_type === 'image' && <Image className="w-5 h-5 text-blue-600" />}
                              {item.status_type === 'video' && <Video className="w-5 h-5 text-pink-600" />}
                              {item.status_type === 'voice' && <Mic className="w-5 h-5 text-green-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-gray-800">
                                  {item.status_type === 'text' ? 'טקסט' :
                                   item.status_type === 'image' ? 'תמונה' :
                                   item.status_type === 'video' ? 'סרטון' : 'הקלטה'}
                                </p>
                                <SourceBadge source={item.source} queueId={item.id} />
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium flex-shrink-0">מתוזמן</span>
                              </div>
                              <p className="text-sm text-gray-500 truncate">
                                {item.content?.text?.substring(0, 50) || item.content?.caption?.substring(0, 50) || ''}
                                {(item.content?.text?.length > 50 || item.content?.caption?.length > 50) && '...'}
                              </p>
                            </div>
                          </button>
                          
                          {/* Schedule time */}
                          <div className="text-left flex-shrink-0">
                            <div className="flex items-center gap-2 text-blue-600 font-medium text-sm">
                              <Clock className="w-4 h-4" />
                              {new Date(item.scheduled_for).toLocaleDateString('he-IL', { 
                                weekday: 'short', 
                                day: 'numeric',
                                month: 'numeric'
                              })}
                            </div>
                            <p className="text-sm text-gray-500">
                              {new Date(item.scheduled_for).toLocaleTimeString('he-IL', { 
                                hour: '2-digit', 
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                          
                          {/* Action buttons */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleSendScheduledNow(item.id)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                              title="שלח עכשיו"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCancelScheduled(item.id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                              title="בטל תזמון"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Immediate Queue (pending / processing items, not yet scheduled) */}
              {queue.length > 0 && (
                <div className="border-t border-gray-100 p-4">
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    בתור לשליחה ({queue.length})
                  </h4>
                  <div className="space-y-2">
                    {queue.map((item, idx) => (
                      <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                        item.queue_status === 'processing'
                          ? 'border-green-200 bg-green-50'
                          : 'border-blue-100 bg-blue-50'
                      }`}>
                        <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {item.status_type === 'text' ? '📝 טקסט' :
                             item.status_type === 'image' ? '🖼️ תמונה' :
                             item.status_type === 'video' ? '🎬 סרטון' : '🎤 קול'}
                            {item.queue_status === 'processing' && (
                              <span className="mr-2 text-xs text-green-600 font-normal">בשליחה...</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">
                            {new Date(item.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {item.queue_status !== 'processing' && (
                            <>
                              <button
                                onClick={() => handleReorderQueue(item.id, 'up')}
                                disabled={idx === 0}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg disabled:opacity-20"
                                title="העלה למעלה"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleReorderQueue(item.id, 'down')}
                                disabled={idx === queue.length - 1}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg disabled:opacity-20"
                                title="הורד למטה"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleCancelQueueItem(item.id)}
                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                title="הסר מהתור"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'numbers' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">מספרים מורשים</h3>
                <button
                  onClick={() => setShowAddNumber(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  הוסף מספר
                </button>
              </div>

              <p className="text-gray-600 mb-4">
                רק מספרים אלה יוכלו לשלוח סטטוסים דרך הבוט בווצאפ
              </p>

              {authorizedNumbers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>לא הוגדרו מספרים מורשים</p>
                  <p className="text-sm">הוסף מספרים שיוכלו להעלות סטטוסים</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {authorizedNumbers.map(num => (
                    <div
                      key={num.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <Phone className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="min-w-0">
                          <ClickablePhone phone={num.phone_number} className="font-medium text-gray-800" />
                          {num.name && <p className="text-sm text-gray-500 truncate">{num.name}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleToggleCanImport(num.id, num.can_import_contacts === true)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                            num.can_import_contacts
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                          title="הרשאה להוסיף אנשי קשר אישיים שיקבלו את הסטטוסים שלו"
                        >
                          {num.can_import_contacts ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          {num.can_import_contacts ? 'מותר להוסיף אנשי קשר' : 'לא מורשה להוסיף'}
                        </button>
                        {num.can_import_contacts && (
                          <button
                            onClick={() => setSenderImportedModal({ id: num.id, label: num.name || num.phone_number })}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition"
                          >
                            <UserPlus className="w-4 h-4" />
                            ניהול אנשי קשר
                            {num.imported_contacts_count > 0 && (
                              <span className="bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                {num.imported_contacts_count.toLocaleString()}
                              </span>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveNumber(num.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Bot Info */}
              <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-200">
                <p className="text-sm text-green-800 mb-2">
                  <strong>מספר הבוט:</strong> <span dir="ltr">{BOT_NUMBER}</span>
                </p>
                <p className="text-sm text-green-700">
                  שלח הודעה, תמונה או סרטון לבוט כדי להעלות סטטוס
                </p>
              </div>
            </div>
          )}

          {/* Add Number Modal */}
          {showAddNumber && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddNumber(false)}>
              <div 
                className="bg-white rounded-2xl w-full max-w-md p-6"
                onClick={e => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold text-gray-800 mb-4">הוספת מספר מורשה</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">מספר טלפון</label>
                    <input
                      type="tel"
                      value={newNumber}
                      onChange={(e) => setNewNumber(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl"
                      placeholder="972501234567"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">שם (אופציונלי)</label>
                    <input
                      type="text"
                      value={newNumberName}
                      onChange={(e) => setNewNumberName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl"
                      placeholder="שם לזיהוי"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowAddNumber(false)}
                    className="flex-1 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={handleAddNumber}
                    className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700"
                  >
                    הוסף
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-1">הגדרות</h3>
                <p className="text-sm text-gray-500">הגדרות כלליות לבוט העלאת הסטטוסים</p>
              </div>

              {/* Video Caption Setting */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Video className="w-4 h-4 text-gray-500" />
                  <h4 className="text-sm font-medium text-gray-700">כיתוב בסרטונים מחולקים</h4>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">
                        {splitVideoCaptionMode === 'all'
                          ? 'הכיתוב יופיע בכל חלקי הסרטון'
                          : 'הכיתוב יופיע רק בחלק הראשון'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCaptionMode('first')}
                        disabled={savingCaptionMode}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          splitVideoCaptionMode === 'first'
                            ? 'bg-green-100 text-green-700 ring-2 ring-green-500'
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        רק ראשון
                      </button>
                      <button
                        onClick={() => updateCaptionMode('all')}
                        disabled={savingCaptionMode}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          splitVideoCaptionMode === 'all'
                            ? 'bg-green-100 text-green-700 ring-2 ring-green-500'
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        כל החלקים
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'failed' && (
            <FailedStatusesTab
              failedStatuses={failedStatuses}
              setFailedStatuses={setFailedStatuses}
              inProgressStatuses={inProgressStatuses}
              toast={toast}
              loadDashboardData={loadDashboardData}
            />
          )}
        </main>
      )}

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={hideConfirm}>
          <div 
            className="bg-white rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-800 mb-2">{confirmModal.title}</h3>
            <p className="text-gray-600 mb-6">{confirmModal.message}</p>
            
            <div className="flex gap-3">
              <button
                onClick={hideConfirm}
                className="flex-1 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                  confirmModal.danger 
                    ? 'bg-red-500 text-white hover:bg-red-600' 
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Color Manager Modal */}
      {showColorManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowColorManager(false)}>
          <div 
            className="bg-white rounded-2xl w-full max-w-lg p-6 animate-in fade-in zoom-in duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">ניהול צבעי רקע</h3>
                <p className="text-sm text-gray-500">ניתן להגדיר עד 10 צבעים ({availableColors.length}/10)</p>
              </div>
              <button
                onClick={resetColors}
                disabled={savingColors}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                איפוס לברירת מחדל
              </button>
            </div>
            
            {/* Current Colors */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">צבעים שלי</h4>
              <div className="flex flex-wrap gap-2">
                {availableColors.map(colorObj => (
                  <div
                    key={colorObj.id}
                    className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <div
                      className="w-6 h-6 rounded-md border border-gray-200"
                      style={{ backgroundColor: '#' + colorObj.id }}
                    />
                    <span className="text-sm text-gray-700">{colorObj.title}</span>
                    <button
                      onClick={() => removeColor(colorObj.id)}
                      className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Add New Color */}
            {availableColors.length < 10 && (
              <div className="pt-4 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-2">הוסף צבע חדש</h4>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newColorHex}
                    onChange={(e) => setNewColorHex(e.target.value)}
                    className="w-12 h-10 rounded-lg cursor-pointer border-2 border-gray-200"
                  />
                  <input
                    type="text"
                    value={newColorTitle}
                    onChange={(e) => setNewColorTitle(e.target.value)}
                    placeholder="שם הצבע"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
                  />
                  <button
                    onClick={addColor}
                    disabled={!newColorTitle.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    הוסף
                  </button>
                </div>
              </div>
            )}
            
            {/* Actions */}
            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowColorManager(false)}
                className="flex-1 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={saveColors}
                disabled={savingColors}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {savingColors ? 'שומר...' : 'שמור צבעים'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Details Modal */}
      {statusDetailsModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-lg">פרטי סטטוס</h3>
              <button 
                onClick={closeStatusDetailsModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 overflow-x-auto">
              <button
                onClick={() => setStatusDetailsModal(prev => ({ ...prev, activeTab: 'content' }))}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap px-2 ${
                  statusDetailsModal.activeTab === 'content' 
                    ? 'text-purple-600 border-b-2 border-purple-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {statusDetailsModal.status?.status_type === 'text' && <Type className="w-4 h-4" />}
                {statusDetailsModal.status?.status_type === 'image' && <Image className="w-4 h-4" />}
                {statusDetailsModal.status?.status_type === 'video' && <Video className="w-4 h-4" />}
                {statusDetailsModal.status?.status_type === 'voice' && <Mic className="w-4 h-4" />}
                תוכן
              </button>
              <button
                onClick={() => setStatusDetailsModal(prev => ({ ...prev, activeTab: 'views' }))}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap px-2 ${
                  statusDetailsModal.activeTab === 'views' 
                    ? 'text-green-600 border-b-2 border-green-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Eye className="w-4 h-4" />
                צפיות ({statusDetailsModal.views.length})
              </button>
              <button
                onClick={() => setStatusDetailsModal(prev => ({ ...prev, activeTab: 'reactions' }))}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap px-2 ${
                  statusDetailsModal.activeTab === 'reactions' 
                    ? 'text-red-500 border-b-2 border-red-500' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Heart className="w-4 h-4" />
                לבבות ({new Set(statusDetailsModal.reactions.map(r => r.reactor_phone)).size})
              </button>
              <button
                onClick={() => setStatusDetailsModal(prev => ({ ...prev, activeTab: 'replies' }))}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap px-2 ${
                  statusDetailsModal.activeTab === 'replies' 
                    ? 'text-blue-500 border-b-2 border-blue-500' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                תגובות ({new Set(statusDetailsModal.replies.map(r => r.replier_phone)).size})
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {statusDetailsModal.loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                </div>
              ) : (
                <>
                  {/* Content Tab */}
                  {statusDetailsModal.activeTab === 'content' && statusDetailsModal.status && (
                    <div className="space-y-4">
                      {/* Status Type Badge */}
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          statusDetailsModal.status.status_type === 'text' ? 'bg-purple-100 text-purple-700' :
                          statusDetailsModal.status.status_type === 'image' ? 'bg-blue-100 text-blue-700' :
                          statusDetailsModal.status.status_type === 'video' ? 'bg-pink-100 text-pink-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {statusDetailsModal.status.status_type === 'text' ? 'טקסט' : 
                           statusDetailsModal.status.status_type === 'image' ? 'תמונה' : 
                           statusDetailsModal.status.status_type === 'video' ? 'סרטון' : 'הקלטה'}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(statusDetailsModal.status.sent_at || statusDetailsModal.status.created_at).toLocaleString('he-IL')}
                        </span>
                      </div>
                      
                      {/* Text Status */}
                      {statusDetailsModal.status.status_type === 'text' && (
                        <div 
                          className="p-4 rounded-xl text-white text-center min-h-[150px] flex items-center justify-center"
                          style={{ 
                            backgroundColor: statusDetailsModal.status.content?.backgroundColor || '#782138'
                          }}
                        >
                          <p className="text-lg whitespace-pre-wrap">{statusDetailsModal.status.content?.text}</p>
                        </div>
                      )}
                      
                      {/* Image Status */}
                      {statusDetailsModal.status.status_type === 'image' && (
                        <div className="space-y-3">
                          {(statusDetailsModal.status.content?.file?.url || statusDetailsModal.status.content?.url) && (
                            <img 
                              src={statusDetailsModal.status.content?.file?.url || statusDetailsModal.status.content?.url} 
                              alt="סטטוס" 
                              className="w-full rounded-xl max-h-[300px] object-contain bg-gray-100"
                            />
                          )}
                          {statusDetailsModal.status.content?.caption && (
                            <p className="text-gray-700">{statusDetailsModal.status.content.caption}</p>
                          )}
                        </div>
                      )}
                      
                      {/* Video Status */}
                      {statusDetailsModal.status.status_type === 'video' && (
                        <div className="space-y-3">
                          {(statusDetailsModal.status.content?.file?.url || statusDetailsModal.status.content?.url) && (
                            <video 
                              src={statusDetailsModal.status.content?.file?.url || statusDetailsModal.status.content?.url} 
                              controls
                              className="w-full rounded-xl max-h-[300px] bg-gray-100"
                            />
                          )}
                          {statusDetailsModal.status.content?.caption && (
                            <p className="text-gray-700">{statusDetailsModal.status.content.caption}</p>
                          )}
                        </div>
                      )}
                      
                      {/* Voice Status */}
                      {statusDetailsModal.status.status_type === 'voice' && (
                        <div 
                          className="p-4 rounded-xl flex items-center justify-center min-h-[100px]"
                          style={{ 
                            backgroundColor: statusDetailsModal.status.content?.backgroundColor || '#782138'
                          }}
                        >
                          {(statusDetailsModal.status.content?.file?.url || statusDetailsModal.status.content?.url) && (
                            <audio 
                              src={statusDetailsModal.status.content?.file?.url || statusDetailsModal.status.content?.url} 
                              controls
                              className="w-full"
                            />
                          )}
                        </div>
                      )}
                      
                      {/* Stats Summary */}
                      <div className="flex items-center justify-around p-4 bg-gray-50 rounded-xl">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-gray-800">{statusDetailsModal.status.view_count || 0}</p>
                          <p className="text-sm text-gray-500">צפיות</p>
                        </div>
                        {(statusDetailsModal.status.new_viewer_count > 0) && (
                          <div className="text-center">
                            <p className="text-2xl font-bold text-emerald-600">+{statusDetailsModal.status.new_viewer_count}</p>
                            <p className="text-sm text-gray-500">צופים חדשים</p>
                          </div>
                        )}
                        <div className="text-center">
                          <p className="text-2xl font-bold text-red-500">{statusDetailsModal.status.reaction_count || 0}</p>
                          <p className="text-sm text-gray-500">לבבות</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-blue-500">{statusDetailsModal.status.reply_count || 0}</p>
                          <p className="text-sm text-gray-500">תגובות</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Views Tab */}
                  {statusDetailsModal.activeTab === 'views' && (
                    <div className="space-y-2">
                      {statusDetailsModal.views.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <Eye className="w-10 h-10 mx-auto mb-2 opacity-50" />
                          <p>אין צפיות עדיין</p>
                        </div>
                      ) : (<>
                        {(() => {
                          const newCount = statusDetailsModal.views.filter(v => v.is_new_viewer).length;
                          return newCount > 0 ? (
                            <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                              <UserPlus className="w-4 h-4" />
                              <span><strong>{newCount}</strong> צופים חדשים מתוך {statusDetailsModal.views.length} צפיות</span>
                            </div>
                          ) : null;
                        })()}
                        {statusDetailsModal.views.map((view, i) => (
                          <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${view.is_new_viewer ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50'}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${view.is_new_viewer ? 'bg-emerald-100' : 'bg-green-100'}`}>
                                {view.is_new_viewer ? <UserPlus className="w-5 h-5 text-emerald-600" /> : <Users className="w-5 h-5 text-green-600" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <ClickablePhone phone={view.viewer_phone} className="font-medium text-gray-800" />
                                  {view.is_new_viewer && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">חדש</span>}
                                </div>
                                {view.viewer_name && <p className="text-sm text-gray-500">{view.viewer_name}</p>}
                              </div>
                            </div>
                            <span className="text-xs text-gray-400">
                              {new Date(view.viewed_at).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </>)}
                    </div>
                  )}

                  {/* Reactions Tab - Grouped by phone */}
                  {statusDetailsModal.activeTab === 'reactions' && (
                    <div className="space-y-3">
                      {statusDetailsModal.reactions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <Heart className="w-10 h-10 mx-auto mb-2 opacity-50" />
                          <p>אין לבבות עדיין</p>
                        </div>
                      ) : (
                        // Group reactions by phone
                        Object.entries(
                          statusDetailsModal.reactions.reduce((acc, r) => {
                            if (!acc[r.reactor_phone]) acc[r.reactor_phone] = [];
                            acc[r.reactor_phone].push(r);
                            return acc;
                          }, {})
                        ).map(([phone, reactions]) => (
                          <div key={phone} className="bg-gray-50 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between p-3 border-b border-gray-100">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                  <Heart className="w-5 h-5 text-red-500" />
                                </div>
                                <div>
                                  <ClickablePhone phone={phone} className="font-medium text-gray-800" />
                                  <p className="text-xs text-gray-500">{reactions.length} תגובות</p>
                                </div>
                              </div>
                            </div>
                            <div className="p-2 flex flex-wrap gap-2">
                              {reactions.map((r, i) => (
                                <div key={i} className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg text-sm">
                                  <span className="text-lg">{r.reaction}</span>
                                  <span className="text-xs text-gray-400">
                                    {new Date(r.reacted_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Replies Tab - Grouped by phone */}
                  {statusDetailsModal.activeTab === 'replies' && (
                    <div className="space-y-3">
                      {statusDetailsModal.replies.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                          <p>אין תגובות עדיין</p>
                        </div>
                      ) : (
                        // Group replies by phone
                        Object.entries(
                          statusDetailsModal.replies.reduce((acc, r) => {
                            if (!acc[r.replier_phone]) acc[r.replier_phone] = [];
                            acc[r.replier_phone].push(r);
                            return acc;
                          }, {})
                        ).map(([phone, replies]) => (
                          <div key={phone} className="bg-gray-50 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between p-3 border-b border-gray-100">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                  <MessageCircle className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                  <ClickablePhone phone={phone} className="font-medium text-gray-800" />
                                  <p className="text-xs text-gray-500">{replies.length} תגובות</p>
                                </div>
                              </div>
                            </div>
                            <div className="p-2 space-y-1">
                              {replies.map((r, i) => (
                                <div key={i} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg">
                                  <p className="text-sm text-gray-700">{r.reply_text}</p>
                                  <span className="text-xs text-gray-400 whitespace-nowrap mr-2">
                                    {new Date(r.replied_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Status Details Modal */}
      {scheduledDetailsModal.show && scheduledDetailsModal.item && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-lg">פרטי סטטוס מתוזמן</h3>
              <button 
                onClick={() => setScheduledDetailsModal({ show: false, item: null, editMode: false, newScheduleDate: '', newScheduleTime: '' })}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Status Type Badge */}
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  scheduledDetailsModal.item.status_type === 'text' ? 'bg-purple-100 text-purple-700' :
                  scheduledDetailsModal.item.status_type === 'image' ? 'bg-blue-100 text-blue-700' :
                  scheduledDetailsModal.item.status_type === 'video' ? 'bg-pink-100 text-pink-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {scheduledDetailsModal.item.status_type === 'text' ? 'טקסט' : 
                   scheduledDetailsModal.item.status_type === 'image' ? 'תמונה' : 
                   scheduledDetailsModal.item.status_type === 'video' ? 'סרטון' : 'הקלטה'}
                </span>
              </div>
              
              {/* Text Status */}
              {scheduledDetailsModal.item.status_type === 'text' && (
                <div 
                  className="p-4 rounded-xl text-white text-center min-h-[150px] flex items-center justify-center"
                  style={{ 
                    backgroundColor: scheduledDetailsModal.item.content?.backgroundColor || '#782138'
                  }}
                >
                  <p className="text-lg whitespace-pre-wrap">{scheduledDetailsModal.item.content?.text}</p>
                </div>
              )}
              
              {/* Image Status */}
              {scheduledDetailsModal.item.status_type === 'image' && (
                <div className="space-y-3">
                  {scheduledDetailsModal.item.content?.file?.url && (
                    <img 
                      src={scheduledDetailsModal.item.content.file.url} 
                      alt="סטטוס" 
                      className="w-full rounded-xl max-h-[300px] object-contain bg-gray-100"
                    />
                  )}
                  {scheduledDetailsModal.item.content?.caption && (
                    <p className="text-gray-700">{scheduledDetailsModal.item.content.caption}</p>
                  )}
                </div>
              )}
              
              {/* Video Status */}
              {scheduledDetailsModal.item.status_type === 'video' && (
                <div className="space-y-3">
                  {scheduledDetailsModal.item.content?.file?.url && (
                    <video 
                      src={scheduledDetailsModal.item.content.file.url} 
                      controls
                      className="w-full rounded-xl max-h-[300px] bg-gray-100"
                    />
                  )}
                  {scheduledDetailsModal.item.content?.caption && (
                    <p className="text-gray-700">{scheduledDetailsModal.item.content.caption}</p>
                  )}
                </div>
              )}
              
              {/* Voice Status */}
              {scheduledDetailsModal.item.status_type === 'voice' && (
                <div 
                  className="p-4 rounded-xl flex items-center justify-center min-h-[100px]"
                  style={{ 
                    backgroundColor: scheduledDetailsModal.item.content?.backgroundColor || '#782138'
                  }}
                >
                  {scheduledDetailsModal.item.content?.file?.url && (
                    <audio 
                      src={scheduledDetailsModal.item.content.file.url} 
                      controls
                      className="w-full"
                    />
                  )}
                </div>
              )}
              
              {/* Schedule Time */}
              <div className="bg-blue-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-800">מתוזמן ל</span>
                </div>
                
                {scheduledDetailsModal.editMode ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={scheduledDetailsModal.newScheduleDate}
                        onChange={(e) => setScheduledDetailsModal(prev => ({ ...prev, newScheduleDate: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <input
                        type="time"
                        value={scheduledDetailsModal.newScheduleTime}
                        onChange={(e) => setScheduledDetailsModal(prev => ({ ...prev, newScheduleTime: e.target.value }))}
                        className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReschedule(
                          scheduledDetailsModal.item.id, 
                          scheduledDetailsModal.newScheduleDate, 
                          scheduledDetailsModal.newScheduleTime
                        )}
                        className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                      >
                        שמור
                      </button>
                      <button
                        onClick={() => setScheduledDetailsModal(prev => ({ ...prev, editMode: false }))}
                        className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200"
                      >
                        ביטול
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-blue-900 text-lg font-bold">
                      {new Date(scheduledDetailsModal.item.scheduled_for).toLocaleString('he-IL', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    <button
                      onClick={() => {
                        const date = new Date(scheduledDetailsModal.item.scheduled_for);
                        setScheduledDetailsModal(prev => ({
                          ...prev,
                          editMode: true,
                          newScheduleDate: date.toISOString().split('T')[0],
                          newScheduleTime: date.toTimeString().slice(0, 5)
                        }));
                      }}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      שנה תזמון
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => {
                  handleSendScheduledNow(scheduledDetailsModal.item.id);
                  setScheduledDetailsModal({ show: false, item: null, editMode: false, newScheduleDate: '', newScheduleTime: '' });
                }}
                className="flex-1 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                שלח עכשיו
              </button>
              <button
                onClick={() => {
                  handleCancelScheduled(scheduledDetailsModal.item.id);
                  setScheduledDetailsModal({ show: false, item: null, editMode: false, newScheduleDate: '', newScheduleTime: '' });
                }}
                className="flex-1 py-2 bg-red-100 text-red-600 rounded-xl font-medium hover:bg-red-200 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                בטל תזמון
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-components
function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'from-blue-500 to-indigo-600',
    green: 'from-green-500 to-emerald-600',
    purple: 'from-purple-500 to-pink-600',
    red: 'from-red-500 to-rose-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, highlight }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${
        active 
          ? 'bg-green-600 text-white' 
          : highlight 
            ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-300 animate-pulse'
            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function TypeButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 rounded-xl font-medium flex flex-col items-center gap-1 transition-colors ${
        active 
          ? 'bg-green-100 text-green-700 border-2 border-green-500' 
          : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-2 border-transparent'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-sm">{label}</span>
    </button>
  );
}

// ─── Israeli DST: last Friday before April → last Sunday in October ───
function isIsraelDST(date) {
  const year = date.getFullYear();
  const dstStart = new Date(year, 2, 31);
  while (dstStart.getDay() !== 5) dstStart.setDate(dstStart.getDate() - 1);
  const dstEnd = new Date(year, 9, 31);
  while (dstEnd.getDay() !== 0) dstEnd.setDate(dstEnd.getDate() - 1);
  return date >= dstStart && date < dstEnd;
}

// ─── Shabbat exit time: Jerusalem (lat 31.7683°, lon 35.2137°), sunset + 42 min ───
function getShabbatEndTime(date) {
  const lat = 31.7683 * Math.PI / 180;
  const lon = 35.2137;
  const year = date.getFullYear();
  const start = new Date(year, 0, 0);
  const dayOfYear = Math.floor((date - start) / 86400000);
  const D = (2 * Math.PI / 365) * (dayOfYear - 80);
  const decl = Math.asin(0.397748 * Math.sin(D));
  const cosHA = -Math.tan(lat) * Math.tan(decl);
  const HA = Math.acos(Math.max(-1, Math.min(1, cosHA)));
  const sunsetUTC = 12 + (HA * 12 / Math.PI) - lon / 15;
  const offset = isIsraelDST(date) ? 3 : 2;
  const total = sunsetUTC + offset + 42 / 60;
  const hRaw = Math.floor(total) % 24;
  const mRaw = Math.round((total - Math.floor(total)) * 60);
  const m = mRaw === 60 ? 0 : mRaw;
  const h = mRaw === 60 ? (hRaw + 1) % 24 : hRaw;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Hebrew date helpers ───
function getHebrewDay(date) {
  try {
    // 'hebr' numbering system returns Hebrew letters (א, ב, ג...)
    return new Intl.DateTimeFormat('he-u-ca-hebrew-nu-hebr', { day: 'numeric' }).format(date);
  } catch {
    try {
      return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric' }).format(date);
    } catch { return ''; }
  }
}

function getHebrewMonthYear(date) {
  try {
    return new Intl.DateTimeFormat('he-u-ca-hebrew', { month: 'long', year: 'numeric' }).format(date);
  } catch { return ''; }
}

// ─── מרכז הפעילות — Premium activity calendar ───
function ScheduledCalendar({ scheduled, statuses, onItemClick, onDayClick, onSendNow, onCancel }) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const today = new Date();

  const DAY_HEADERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  function getCalendarDays(month) {
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1).getDay();
    const count = new Date(y, m + 1, 0).getDate();
    const days = Array(first).fill(null);
    for (let d = 1; d <= count; d++) days.push(new Date(y, m, d));
    return days;
  }

  const days = getCalendarDays(currentMonth);

  // dateKey helper
  const dk = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  // Group scheduled items by date
  const scheduledByDate = {};
  (scheduled || []).forEach(item => {
    if (!item.scheduled_for) return;
    const key = dk(new Date(item.scheduled_for));
    (scheduledByDate[key] = scheduledByDate[key] || []).push({ ...item, _kind: 'scheduled' });
  });

  // Group sent history items by date
  const sentByDate = {};
  (statuses || []).forEach(item => {
    if (!item.sent_at) return;
    const key = dk(new Date(item.sent_at));
    (sentByDate[key] = sentByDate[key] || []).push({ ...item, _kind: 'sent' });
  });

  const prevMonth = () => setCurrentMonth(p => new Date(p.getFullYear(), p.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(p => new Date(p.getFullYear(), p.getMonth() + 1, 1));

  const gregTitle = currentMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const hebTitle = getHebrewMonthYear(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 15));

  const TYPE_ICON = { text: 'T', image: '🖼', video: '🎬', voice: '🎤' };

  // Count total activity this month
  const monthKey = `${currentMonth.getFullYear()}-${currentMonth.getMonth()}`;
  const totalScheduled = (scheduled || []).filter(i => {
    const d = new Date(i.scheduled_for);
    return `${d.getFullYear()}-${d.getMonth()}` === monthKey;
  }).length;
  const totalSent = (statuses || []).filter(i => {
    const d = new Date(i.sent_at);
    return `${d.getFullYear()}-${d.getMonth()}` === monthKey;
  }).length;

  return (
    <div dir="rtl" className="select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={nextMonth}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </button>

        <div className="text-center">
          <div className="font-bold text-gray-900 text-lg leading-tight">{gregTitle}</div>
          <div className="text-xs text-gray-400 mt-0.5">{hebTitle}</div>
          <div className="flex items-center justify-center gap-3 mt-1.5">
            {totalScheduled > 0 && (
              <span className="text-[11px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                {totalScheduled} מתוזמן{totalScheduled !== 1 ? 'ים' : ''}
              </span>
            )}
            {totalSent > 0 && (
              <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                {totalSent} נשלח{totalSent !== 1 ? 'ו' : ''}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={prevMonth}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_HEADERS.map((label, i) => (
          <div
            key={i}
            className={`text-center text-xs font-semibold py-1.5 ${
              i === 6 ? 'text-purple-500' : i === 5 ? 'text-blue-400' : 'text-gray-400'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (!day) return <div key={i} className="min-h-[90px]" />;

          const key = dk(day);
          const schItems = scheduledByDate[key] || [];
          const sentItems = sentByDate[key] || [];
          const allItems = [...schItems, ...sentItems];
          const isToday = day.toDateString() === today.toDateString();
          const isSat = day.getDay() === 6;
          const isFri = day.getDay() === 5;
          const isPast = day < today && !isToday;
          const isFuture = day > today;
          const hasActivity = allItems.length > 0;

          return (
            <div
              key={i}
              onClick={() => !isPast && onDayClick && onDayClick(day)}
              className={`min-h-[90px] rounded-xl p-1.5 border text-right transition-all ${
                isToday
                  ? 'border-blue-400 bg-blue-50 shadow-sm'
                  : isSat
                  ? 'border-purple-200 bg-purple-50/60'
                  : isFri
                  ? 'border-blue-100 bg-blue-50/30'
                  : hasActivity
                  ? 'border-gray-200 bg-white'
                  : 'border-gray-100 bg-white'
              } ${isPast ? 'opacity-50' : ''} ${isFuture || isToday ? 'cursor-pointer hover:border-blue-300 hover:shadow-sm' : 'cursor-default'}`}
            >
              {/* Day number + Hebrew letter */}
              <div className="flex items-start justify-between mb-1">
                <span className={`text-xs font-bold leading-tight ${
                  isToday ? 'text-blue-600' : isSat ? 'text-purple-600' : isFri ? 'text-blue-500' : 'text-gray-700'
                }`}>
                  {day.getDate()}
                </span>
                <span className="text-[9px] text-gray-400 leading-tight font-medium">{getHebrewDay(day)}</span>
              </div>

              {/* Shabbat exit time on Saturday */}
              {isSat && (
                <div className="text-[8.5px] text-purple-500 font-medium leading-tight mb-1">
                  מוצ"ש {getShabbatEndTime(day)}
                </div>
              )}

              {/* Activity items: scheduled first, then sent */}
              {allItems.slice(0, 3).map((item, idx) => {
                const isSch = item._kind === 'scheduled';
                const time = isSch
                  ? new Date(item.scheduled_for).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
                  : new Date(item.sent_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

                return (
                  <div
                    key={idx}
                    onClick={e => { e.stopPropagation(); onItemClick && onItemClick(item); }}
                    title={isSch ? 'מתוזמן — לחץ לפרטים' : 'נשלח — לחץ לפרטים'}
                    className={`text-[9.5px] truncate px-1 py-0.5 rounded mb-0.5 cursor-pointer flex items-center gap-0.5 ${
                      isSch
                        ? 'bg-orange-100 text-orange-800 border border-orange-200'
                        : item.status_type === 'text'
                        ? 'bg-purple-50 text-purple-700'
                        : item.status_type === 'image'
                        ? 'bg-blue-50 text-blue-700'
                        : item.status_type === 'video'
                        ? 'bg-pink-50 text-pink-700'
                        : 'bg-green-50 text-green-700'
                    }`}
                  >
                    <span className="flex-shrink-0">{isSch ? '⏰' : '✓'}</span>
                    <span>{time}</span>
                    <span className="flex-shrink-0">{TYPE_ICON[item.status_type] || ''}</span>
                  </div>
                );
              })}

              {allItems.length > 3 && (
                <div className="text-[8.5px] text-gray-400 text-center font-medium">
                  +{allItems.length - 3} עוד
                </div>
              )}

              {/* "+" hint for future empty days */}
              {(isFuture || isToday) && allItems.length === 0 && (
                <div className="flex items-end justify-center h-8">
                  <span className="text-[10px] text-gray-300">+</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-3 justify-center text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-orange-100 border border-orange-200 inline-block" />
          מתוזמן
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-purple-50 inline-block" />
          טקסט נשלח
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-blue-50 inline-block" />
          תמונה נשלחה
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-pink-50 inline-block" />
          סרטון נשלח
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-purple-50/60 border border-purple-200 inline-block" />
          שבת
        </span>
        <span className="flex items-center gap-1.5 text-blue-500">
          לחץ על יום עתידי ליצירת סטטוס מתוזמן
        </span>
      </div>
    </div>
  );
}

// isOurBot: true only when source='whatsapp' AND queueId is present (went through our queue system).
// This prevents false "בוט" labels on statuses from external bots or other linked devices.
function SourceBadge({ source, queueId }) {
  if (source === 'whatsapp' && !!queueId) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex-shrink-0">בוט</span>;
  }
  if (source === 'web') {
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium flex-shrink-0">אתר</span>;
  }
  if (source === 'manual' || source === 'device') {
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium flex-shrink-0">מכשיר</span>;
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium flex-shrink-0">מכשיר מקושר</span>
  );
}

function StatusRow({ status, onDelete, isActive, onShowDetails }) {
  const typeIcons = {
    text: Type,
    image: Image,
    video: Video,
    voice: Mic,
  };
  const Icon = typeIcons[status.status_type] || Type;
  const isDeleted = status.is_deleted;
  
  // Get status label
  const getStatusLabel = () => {
    if (isDeleted) return { text: 'נמחק', color: 'text-gray-400' };
    if (status.queue_status === 'pending') return { text: 'ממתין בתור', color: 'text-yellow-600' };
    if (status.queue_status === 'processing') return { text: 'שולח...', color: 'text-blue-600' };
    if (status.queue_status === 'sent') return { text: 'נשלח', color: 'text-green-600' };
    if (status.queue_status === 'failed') return { text: 'נכשל', color: 'text-red-600' };
    return null;
  };
  
  const statusLabel = getStatusLabel();
  const canShowStats = status.queue_status !== 'pending' && status.queue_status !== 'processing';

  return (
    <div className={`p-4 flex items-center justify-between ${isDeleted ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'}`}>
      <button 
        onClick={() => onShowDetails(status.id, 'content')}
        className="flex items-center gap-3 text-right flex-1 min-w-0"
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isDeleted ? 'bg-gray-200' : isActive ? 'bg-green-100' : 'bg-gray-100'
        }`}>
          <Icon className={`w-5 h-5 ${isDeleted ? 'text-gray-400' : isActive ? 'text-green-600' : 'text-gray-600'}`} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-medium truncate ${isDeleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
              {status.status_type === 'text'
                ? (status.content?.text?.substring(0, 40) || 'סטטוס טקסט') + (status.content?.text?.length > 40 ? '...' : '')
                : `סטטוס ${status.status_type === 'image' ? 'תמונה' : status.status_type === 'video' ? 'סרטון' : status.status_type === 'voice' ? 'קול' : status.status_type}`
              }
            </p>
            <SourceBadge source={status.source} queueId={status.queue_id} />
            {statusLabel && (
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusLabel.color} ${
                status.queue_status === 'pending' ? 'bg-yellow-50' :
                status.queue_status === 'processing' ? 'bg-blue-50 animate-pulse' :
                status.queue_status === 'sent' ? 'bg-green-50' :
                status.queue_status === 'failed' ? 'bg-red-50' :
                isDeleted ? 'bg-gray-100' : ''
              }`}>
                {statusLabel.text}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {new Date(status.sent_at || status.created_at).toLocaleString('he-IL')}
          </p>
        </div>
      </button>
      
      <div className="flex items-center gap-4">
        {/* Stats - show even for deleted statuses */}
        {canShowStats && (
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <button
              onClick={() => onShowDetails(status.id, 'views')}
              className="flex items-center gap-1 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
              title="צפיות - לחץ לפרטים"
            >
              <Eye className="w-4 h-4" />
              {status.view_count || 0}
              {(status.new_viewer_count > 0) && (
                <span className="flex items-center gap-0.5 text-emerald-600 font-medium" title="צופים חדשים">
                  <UserPlus className="w-3.5 h-3.5" />+{status.new_viewer_count}
                </span>
              )}
            </button>
            <button 
              onClick={() => onShowDetails(status.id, 'reactions')}
              className="flex items-center gap-1 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors"
              title="לבבות - לחץ לפרטים"
            >
              <Heart className="w-4 h-4 text-red-400" />
              {status.reaction_count || 0}
            </button>
            <button 
              onClick={() => onShowDetails(status.id, 'replies')}
              className="flex items-center gap-1 hover:text-blue-500 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
              title="תגובות - לחץ לפרטים"
            >
              <MessageCircle className="w-4 h-4 text-blue-400" />
              {status.reply_count || 0}
            </button>
          </div>
        )}
        
        {/* Delete button - only if not deleted and active */}
        {!isDeleted && isActive && (
          <button
            onClick={onDelete}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="מחק סטטוס"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        
        {/* Deleted indicator */}
        {isDeleted && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
            נמחק {status.deleted_at && new Date(status.deleted_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}

function PendingStatusesTab({ pendingStatuses, setPendingStatuses, toast, loadDashboardData }) {
  const [actionLoading, setActionLoading] = useState({});
  const [scheduleModal, setScheduleModal] = useState({ show: false, statusId: null, scheduleDate: '', scheduleTime: '' });
  const [detailsModal, setDetailsModal] = useState({ show: false, status: null });
  
  const typeIcons = {
    text: Type,
    image: Image,
    video: Video,
    voice: Mic,
  };
  
  // Get status ID - handle both API format (id) and socket format (statusId)
  const getStatusId = (status) => status.id || status.statusId;
  
  const handleSendNow = async (statusId) => {
    setActionLoading(prev => ({ ...prev, [statusId]: 'sending' }));
    try {
      await api.post(`/status-bot/pending-statuses/${statusId}/send`);
      setPendingStatuses(prev => prev.filter(p => getStatusId(p) !== statusId));
      toast.success('הסטטוס נשלח לתור!');
      loadDashboardData();
    } catch (err) {
      console.error('Send pending status error:', err);
      toast.error('שגיאה בשליחת הסטטוס');
    } finally {
      setActionLoading(prev => ({ ...prev, [statusId]: null }));
    }
  };
  
  const handleSchedule = async () => {
    const { statusId, scheduleDate, scheduleTime } = scheduleModal;
    if (!scheduleDate || !scheduleTime) {
      toast.error('נא לבחור תאריך ושעה');
      return;
    }
    
    setActionLoading(prev => ({ ...prev, [statusId]: 'scheduling' }));
    try {
      await api.post(`/status-bot/pending-statuses/${statusId}/schedule`, {
        scheduleDate,
        scheduleTime
      });
      setPendingStatuses(prev => prev.filter(p => getStatusId(p) !== statusId));
      setScheduleModal({ show: false, statusId: null, scheduleDate: '', scheduleTime: '' });
      toast.success('הסטטוס תוזמן בהצלחה!');
      loadDashboardData();
    } catch (err) {
      console.error('Schedule pending status error:', err);
      toast.error('שגיאה בתזמון הסטטוס');
    } finally {
      setActionLoading(prev => ({ ...prev, [statusId]: null }));
    }
  };
  
  const handleCancel = async (statusId) => {
    setActionLoading(prev => ({ ...prev, [statusId]: 'canceling' }));
    try {
      await api.delete(`/status-bot/pending-statuses/${statusId}`);
      setPendingStatuses(prev => prev.filter(p => getStatusId(p) !== statusId));
      toast.success('הסטטוס בוטל');
    } catch (err) {
      console.error('Cancel pending status error:', err);
      toast.error('שגיאה בביטול הסטטוס');
    } finally {
      setActionLoading(prev => ({ ...prev, [statusId]: null }));
    }
  };
  
  const getStatusPreview = (status) => {
    // Handle both API format (flat) and socket format (nested content)
    switch (status.type) {
      case 'text':
        const text = status.text || status.content?.text;
        return text ? text.substring(0, 50) + (text.length > 50 ? '...' : '') : 'סטטוס טקסט';
      case 'image':
        return status.caption || status.content?.caption || 'תמונה';
      case 'video':
      case 'video_split':
        return status.caption || status.originalCaption || status.content?.caption || 'סרטון';
      case 'voice':
        return 'הודעה קולית';
      default:
        return 'סטטוס';
    }
  };
  
  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return '';
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'עכשיו';
    if (minutes < 60) return `לפני ${minutes} דקות`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `לפני ${hours} שעות`;
    return new Date(timestamp).toLocaleString('he-IL');
  };

  if (pendingStatuses.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>אין סטטוסים ממתינים</p>
        <p className="text-sm mt-2">סטטוסים שתשלח דרך בוט הווצאפ יופיעו כאן</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
        <div className="flex items-center gap-2 text-orange-700">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">יש לך {pendingStatuses.length} סטטוסים שממתינים לאישור</span>
        </div>
        <p className="text-sm text-orange-600 mt-1">
          סטטוסים אלו נשלחו דרך בוט הווצאפ וממתינים לאישור שליחה, תזמון או ביטול
        </p>
      </div>
      
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
        {pendingStatuses.map(status => {
          const statusId = getStatusId(status);
          const Icon = typeIcons[status.type] || (status.type === 'video_split' ? Video : Type);
          const isLoading = actionLoading[statusId];
          const mediaUrl = status.url || status.content?.url;
          const bgColor = status.backgroundColor || status.content?.backgroundColor;
          const statusText = status.text || status.content?.text;
          const partsCount = status.parts?.length || status.totalParts || 0;
          
          return (
            <div key={statusId} className="p-4">
              <div className="flex items-start gap-4">
                {/* Preview thumbnail - clickable */}
                <button
                  onClick={() => setDetailsModal({ show: true, status })}
                  className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-green-500 transition-all cursor-pointer"
                >
                  {status.type === 'image' && mediaUrl ? (
                    <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                  ) : (status.type === 'video' || status.type === 'video_split') && mediaUrl ? (
                    <video src={mediaUrl} className="w-full h-full object-cover" />
                  ) : status.type === 'text' && bgColor ? (
                    <div 
                      className="w-full h-full flex items-center justify-center p-2"
                      style={{ backgroundColor: bgColor }}
                    >
                      <span className="text-white text-xs text-center truncate">{statusText?.substring(0, 20)}</span>
                    </div>
                  ) : (
                    <Icon className="w-8 h-8 text-gray-400" />
                  )}
                </button>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      status.type === 'text' ? 'bg-purple-100 text-purple-700' :
                      status.type === 'image' ? 'bg-blue-100 text-blue-700' :
                      (status.type === 'video' || status.type === 'video_split') ? 'bg-red-100 text-red-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {status.type === 'text' ? 'טקסט' :
                       status.type === 'image' ? 'תמונה' :
                       (status.type === 'video' || status.type === 'video_split') ? 'סרטון' : 'קול'}
                    </span>
                    {partsCount > 1 && (
                      <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
                        {partsCount} חלקים
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{formatTimeAgo(status.createdAt || status.receivedAt)}</span>
                  </div>
                  
                  <p className="text-gray-800 truncate">{getStatusPreview(status)}</p>
                  
                  {(status.caption || status.originalCaption) && (
                    <p className="text-sm text-gray-500 truncate mt-1">{status.caption || status.originalCaption}</p>
                  )}
                  
                  {/* Video parts preview */}
                  {status.parts && status.parts.length > 1 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                      {status.parts.map((part, idx) => (
                        <div key={idx} className="flex-shrink-0 text-center">
                          <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center">
                            <Video className="w-5 h-5 text-gray-400" />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">חלק {idx + 1}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setDetailsModal({ show: true, status })}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                    title="צפה בפרטים"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={() => handleSendNow(statusId)}
                    disabled={isLoading}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1 text-sm font-medium"
                  >
                    {isLoading === 'sending' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    שלח עכשיו
                  </button>
                  
                  <button
                    onClick={() => setScheduleModal({ show: true, statusId, scheduleDate: '', scheduleTime: '' })}
                    disabled={isLoading}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 text-sm font-medium"
                  >
                    <Clock className="w-4 h-4" />
                    תזמן
                  </button>
                  
                  <button
                    onClick={() => handleCancel(statusId)}
                    disabled={isLoading}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                    title="בטל"
                  >
                    {isLoading === 'canceling' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Schedule Modal */}
      {scheduleModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setScheduleModal({ show: false, statusId: null, scheduleDate: '', scheduleTime: '' })}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">תזמון סטטוס</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך</label>
                <input
                  type="date"
                  value={scheduleModal.scheduleDate}
                  onChange={(e) => setScheduleModal(prev => ({ ...prev, scheduleDate: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שעה</label>
                <input
                  type="time"
                  value={scheduleModal.scheduleTime}
                  onChange={(e) => setScheduleModal(prev => ({ ...prev, scheduleTime: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setScheduleModal({ show: false, statusId: null, scheduleDate: '', scheduleTime: '' })}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={handleSchedule}
                disabled={actionLoading[scheduleModal.statusId]}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading[scheduleModal.statusId] === 'scheduling' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
                תזמן
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Details Modal */}
      {detailsModal.show && detailsModal.status && (() => {
        const status = detailsModal.status;
        const statusId = getStatusId(status);
        const mediaUrl = status.url || status.content?.url;
        const bgColor = status.backgroundColor || status.content?.backgroundColor;
        const statusText = status.text || status.content?.text;
        const caption = status.caption || status.originalCaption || status.content?.caption;
        const partsCount = status.parts?.length || status.totalParts || 0;
        const isLoading = actionLoading[statusId];
        
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailsModal({ show: false, status: null })}>
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-lg">פרטי סטטוס</h3>
                <button 
                  onClick={() => setDetailsModal({ show: false, status: null })}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Status Type Badge */}
                <div className="flex items-center gap-2 mb-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    status.type === 'text' ? 'bg-purple-100 text-purple-700' :
                    status.type === 'image' ? 'bg-blue-100 text-blue-700' :
                    (status.type === 'video' || status.type === 'video_split') ? 'bg-pink-100 text-pink-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {status.type === 'text' ? 'טקסט' : 
                     status.type === 'image' ? 'תמונה' : 
                     (status.type === 'video' || status.type === 'video_split') ? 'סרטון' : 'הקלטה'}
                  </span>
                  {partsCount > 1 && (
                    <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700">
                      {partsCount} חלקים
                    </span>
                  )}
                  <span className="text-sm text-gray-500">
                    {new Date(status.createdAt || status.receivedAt).toLocaleString('he-IL')}
                  </span>
                </div>
                
                {/* Text Status */}
                {status.type === 'text' && (
                  <div 
                    className="p-6 rounded-xl text-white text-center min-h-[200px] flex items-center justify-center"
                    style={{ backgroundColor: bgColor || '#782138' }}
                  >
                    <p className="text-xl whitespace-pre-wrap">{statusText}</p>
                  </div>
                )}
                
                {/* Image Status */}
                {status.type === 'image' && mediaUrl && (
                  <div className="space-y-3">
                    <img 
                      src={mediaUrl} 
                      alt="סטטוס" 
                      className="w-full rounded-xl max-h-[400px] object-contain bg-gray-100"
                    />
                    {caption && (
                      <p className="text-gray-700 p-3 bg-gray-50 rounded-lg">{caption}</p>
                    )}
                  </div>
                )}
                
                {/* Video Status */}
                {(status.type === 'video' || status.type === 'video_split') && mediaUrl && (
                  <div className="space-y-3">
                    <video 
                      src={mediaUrl} 
                      controls
                      className="w-full rounded-xl max-h-[400px] bg-gray-100"
                    />
                    {caption && (
                      <p className="text-gray-700 p-3 bg-gray-50 rounded-lg">{caption}</p>
                    )}
                  </div>
                )}
                
                {/* Voice Status */}
                {status.type === 'voice' && mediaUrl && (
                  <div 
                    className="p-6 rounded-xl flex items-center justify-center min-h-[150px]"
                    style={{ backgroundColor: bgColor || '#782138' }}
                  >
                    <audio 
                      src={mediaUrl} 
                      controls
                      className="w-full"
                    />
                  </div>
                )}
                
                {/* Video Parts Preview */}
                {status.parts && status.parts.length > 1 && (
                  <div className="mt-4">
                    <h4 className="font-medium text-gray-700 mb-2">חלקי הסרטון ({status.parts.length})</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {status.parts.map((part, idx) => {
                        const partUrl = typeof part === 'object' ? part.url : part;
                        return (
                          <div key={idx} className="bg-gray-100 rounded-lg overflow-hidden">
                            <video 
                              src={partUrl} 
                              className="w-full h-24 object-cover"
                            />
                            <div className="p-2 text-center">
                              <p className="text-xs text-gray-600">חלק {idx + 1}</p>
                              {part.caption && (
                                <p className="text-xs text-gray-400 truncate">{part.caption}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Actions */}
              <div className="p-4 border-t border-gray-100 flex gap-3">
                <button
                  onClick={() => {
                    setDetailsModal({ show: false, status: null });
                    handleCancel(statusId);
                  }}
                  disabled={isLoading}
                  className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  בטל
                </button>
                <button
                  onClick={() => {
                    setDetailsModal({ show: false, status: null });
                    setScheduleModal({ show: true, statusId, scheduleDate: '', scheduleTime: '' });
                  }}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Clock className="w-4 h-4" />
                  תזמן
                </button>
                <button
                  onClick={() => {
                    setDetailsModal({ show: false, status: null });
                    handleSendNow(statusId);
                  }}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading === 'sending' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  שלח עכשיו
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function FailedStatusesTab({ failedStatuses, setFailedStatuses, toast, loadDashboardData, inProgressStatuses = [] }) {
  const [actionLoading, setActionLoading] = useState({});
  const [editModal, setEditModal] = useState({ show: false, status: null });
  const [editContent, setEditContent] = useState({});
  
  const typeIcons = {
    text: Type,
    image: Image,
    video: Video,
    voice: Mic,
  };
  
  const defaultColors = [
    { id: '782138', title: 'בורדו' },
    { id: '6e267d', title: 'סגול כהה' },
    { id: '8d698f', title: 'סגול לילך' },
    { id: '38b42f', title: 'ירוק' },
    { id: '243740', title: 'תורכיז כהה' },
  ];
  
  const handleRetry = async (queueId) => {
    setActionLoading(prev => ({ ...prev, [queueId]: 'retrying' }));
    try {
      await api.post(`/status-bot/failed/${queueId}/retry`);
      setFailedStatuses(prev => prev.filter(s => s.id !== queueId));
      toast.success('הסטטוס הוכנס מחדש לתור');
      loadDashboardData();
    } catch (err) {
      console.error('Retry failed status error:', err);
      toast.error('שגיאה בניסיון מחדש');
    } finally {
      setActionLoading(prev => ({ ...prev, [queueId]: null }));
    }
  };
  
  const handleDelete = async (queueId) => {
    setActionLoading(prev => ({ ...prev, [queueId]: 'deleting' }));
    try {
      await api.delete(`/status-bot/failed/${queueId}`);
      setFailedStatuses(prev => prev.filter(s => s.id !== queueId));
      toast.success('הסטטוס נמחק');
    } catch (err) {
      console.error('Delete failed status error:', err);
      toast.error('שגיאה במחיקה');
    } finally {
      setActionLoading(prev => ({ ...prev, [queueId]: null }));
    }
  };
  
  const openEditModal = (status) => {
    const content = status.content || {};
    setEditContent({
      text: content.text || '',
      caption: content.caption || '',
      backgroundColor: content.backgroundColor || '#38b42f',
      file: content.file?.url || content.url || content.file || '',
    });
    setEditModal({ show: true, status });
  };
  
  const handleSaveAndRetry = async () => {
    const status = editModal.status;
    if (!status) return;
    
    setActionLoading(prev => ({ ...prev, [status.id]: 'saving' }));
    try {
      const content = { ...status.content };
      
      if (status.status_type === 'text') {
        content.text = editContent.text;
        content.backgroundColor = editContent.backgroundColor;
      } else if (['image', 'video'].includes(status.status_type)) {
        content.caption = editContent.caption;
      }
      
      await api.put(`/status-bot/failed/${status.id}`, { content });
      setFailedStatuses(prev => prev.filter(s => s.id !== status.id));
      setEditModal({ show: false, status: null });
      toast.success('הסטטוס עודכן והוכנס לתור');
      loadDashboardData();
    } catch (err) {
      console.error('Save and retry error:', err);
      toast.error('שגיאה בעדכון');
    } finally {
      setActionLoading(prev => ({ ...prev, [status.id]: null }));
    }
  };
  
  const getStatusPreview = (status) => {
    const content = status.content;
    if (!content) return 'סטטוס';
    
    switch (status.status_type) {
      case 'text':
        return content.text ? content.text.substring(0, 50) + (content.text.length > 50 ? '...' : '') : 'סטטוס טקסט';
      case 'image':
        return content.caption || 'תמונה';
      case 'video':
        return content.caption || 'סרטון';
      case 'voice':
        return 'הודעה קולית';
      default:
        return 'סטטוס';
    }
  };
  
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* In Progress Section */}
      {inProgressStatuses.length > 0 && (
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-center gap-2 text-blue-700">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="font-medium">בתהליך שליחה ({inProgressStatuses.length})</span>
            </div>
            <p className="text-sm text-blue-600 mt-1">
              הסטטוסים האלו כרגע בתור או בתהליך שליחה
            </p>
          </div>
          
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
            {inProgressStatuses.map(status => {
              const Icon = typeIcons[status.status_type] || Type;
              const content = status.content || {};
              const mediaUrl = content.file?.url || content.url || content.file;
              
              return (
                <div key={status.id} className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {status.status_type === 'image' && mediaUrl ? (
                        <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                      ) : status.status_type === 'video' && mediaUrl ? (
                        <video src={mediaUrl} className="w-full h-full object-cover" />
                      ) : status.status_type === 'text' && content.backgroundColor ? (
                        <div className="w-full h-full" style={{ backgroundColor: content.backgroundColor }} />
                      ) : (
                        <Icon className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          status.queue_status === 'processing' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {status.queue_status === 'processing' ? 'בשליחה...' : 'בתור'}
                        </span>
                        {status.queue_status === 'processing' && status.contacts_total > 0 && (
                          <span className="text-xs font-medium text-yellow-700">
                            {Math.round((status.contacts_sent / status.contacts_total) * 100)}%
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{formatDate(status.created_at)}</span>
                      </div>
                      {status.queue_status === 'processing' && status.contacts_total > 0 ? (
                        <div className="mt-1.5">
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-yellow-500 h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${Math.round((status.contacts_sent / status.contacts_total) * 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{status.contacts_sent.toLocaleString()} / {status.contacts_total.toLocaleString()} אנשי קשר</p>
                        </div>
                      ) : (
                        <p className="text-gray-800 truncate text-sm mt-1">{getStatusPreview(status)}</p>
                      )}
                    </div>
                    {status.queue_status === 'processing' && (
                      <Loader2 className="w-5 h-5 text-yellow-600 animate-spin" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Failed Section */}
      {failedStatuses.length === 0 && inProgressStatuses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-500">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50 text-green-500" />
          <p>אין סטטוסים שנכשלו</p>
          <p className="text-sm mt-2">כל הסטטוסים נשלחו בהצלחה</p>
        </div>
      ) : failedStatuses.length > 0 && (
        <>
          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">סטטוסים שנכשלו או בוטלו ({failedStatuses.length})</span>
            </div>
            <p className="text-sm text-red-600 mt-1">
              ניתן לערוך, לנסות שוב או למחוק
            </p>
          </div>
          
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
            {failedStatuses.map(status => {
              const Icon = typeIcons[status.status_type] || Type;
              const isLoading = actionLoading[status.id];
              const content = status.content || {};
              const mediaUrl = content.file?.url || content.url || content.file;
              
              return (
                <div key={status.id} className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Preview thumbnail - clickable */}
                    <button
                      onClick={() => openEditModal(status)}
                      className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-green-500 transition-all"
                    >
                      {status.status_type === 'image' && mediaUrl ? (
                        <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                      ) : status.status_type === 'video' && mediaUrl ? (
                        <video src={mediaUrl} className="w-full h-full object-cover" />
                      ) : status.status_type === 'text' && content.backgroundColor ? (
                        <div 
                          className="w-full h-full flex items-center justify-center p-2"
                          style={{ backgroundColor: content.backgroundColor }}
                        >
                          <span className="text-white text-xs text-center truncate">{content.text?.substring(0, 20)}</span>
                        </div>
                      ) : (
                        <Icon className="w-8 h-8 text-gray-400" />
                      )}
                    </button>
                    
                    {/* Content - clickable */}
                    <button 
                      onClick={() => openEditModal(status)}
                      className="flex-1 min-w-0 text-right hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          status.status_type === 'text' ? 'bg-purple-100 text-purple-700' :
                          status.status_type === 'image' ? 'bg-blue-100 text-blue-700' :
                          status.status_type === 'video' ? 'bg-red-100 text-red-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {status.status_type === 'text' ? 'טקסט' :
                           status.status_type === 'image' ? 'תמונה' :
                           status.status_type === 'video' ? 'סרטון' : 'קול'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          status.queue_status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {status.queue_status === 'failed' ? 'נכשל' : 'בוטל'}
                        </span>
                        <span className="text-xs text-gray-400">{formatDate(status.created_at)}</span>
                      </div>
                      
                      <p className="text-gray-800 truncate">{getStatusPreview(status)}</p>
                      
                      {status.error_message && (
                        <p className="text-sm text-red-500 mt-1 truncate">
                          שגיאה: {status.error_message}
                        </p>
                      )}
                    </button>
                    
                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => openEditModal(status)}
                        disabled={isLoading}
                        className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 flex items-center gap-1.5 text-sm"
                        title="צפה וערוך"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRetry(status.id)}
                        disabled={isLoading}
                        className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 flex items-center gap-1.5 text-sm"
                      >
                        {isLoading === 'retrying' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(status.id)}
                        disabled={isLoading}
                        className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 flex items-center gap-1.5 text-sm"
                      >
                        {isLoading === 'deleting' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      
      {/* Edit Modal */}
      {editModal.show && editModal.status && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditModal({ show: false, status: null })}>
          <div 
            className="bg-white rounded-2xl w-full max-w-lg p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">פרטי סטטוס</h3>
              <button onClick={() => setEditModal({ show: false, status: null })} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Status Preview */}
            <div className="mb-6">
              {editModal.status.status_type === 'text' ? (
                <div 
                  className="w-full aspect-[9/16] max-h-64 rounded-xl flex items-center justify-center p-4"
                  style={{ backgroundColor: editContent.backgroundColor }}
                >
                  <p className="text-white text-center whitespace-pre-wrap">{editContent.text || 'טקסט ריק'}</p>
                </div>
              ) : editModal.status.status_type === 'image' ? (
                <img 
                  src={editContent.file} 
                  alt="" 
                  className="w-full max-h-64 object-contain rounded-xl bg-gray-100"
                />
              ) : editModal.status.status_type === 'video' ? (
                <video 
                  src={editContent.file} 
                  controls 
                  className="w-full max-h-64 rounded-xl bg-gray-100"
                />
              ) : (
                <div className="w-full h-32 bg-gray-100 rounded-xl flex items-center justify-center">
                  <Mic className="w-12 h-12 text-gray-400" />
                </div>
              )}
            </div>
            
            {/* Edit Form */}
            {editModal.status.status_type === 'text' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">טקסט</label>
                  <textarea
                    value={editContent.text}
                    onChange={(e) => setEditContent(prev => ({ ...prev, text: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    rows={4}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">צבע רקע</label>
                  <div className="flex flex-wrap gap-2">
                    {defaultColors.map(color => (
                      <button
                        key={color.id}
                        onClick={() => setEditContent(prev => ({ ...prev, backgroundColor: `#${color.id}` }))}
                        className={`w-10 h-10 rounded-lg border-2 transition-all ${
                          editContent.backgroundColor === `#${color.id}` ? 'border-green-500 scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: `#${color.id}` }}
                        title={color.title}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {['image', 'video'].includes(editModal.status.status_type) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">כיתוב</label>
                <textarea
                  value={editContent.caption}
                  onChange={(e) => setEditContent(prev => ({ ...prev, caption: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  rows={3}
                  placeholder="כיתוב (אופציונלי)"
                />
              </div>
            )}
            
            {/* Error message if exists */}
            {editModal.status.error_message && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">
                  <span className="font-medium">שגיאה קודמת:</span> {editModal.status.error_message}
                </p>
              </div>
            )}
            
            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditModal({ show: false, status: null })}
                className="flex-1 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={() => handleRetry(editModal.status.id)}
                disabled={actionLoading[editModal.status.id]}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading[editModal.status.id] === 'retrying' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                שלח ללא שינויים
              </button>
              <button
                onClick={handleSaveAndRetry}
                disabled={actionLoading[editModal.status.id]}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading[editModal.status.id] === 'saving' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                שמור ושלח
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

