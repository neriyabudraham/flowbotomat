import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Smartphone, Upload, Clock, Users, ArrowLeft, RefreshCw,
  Check, Plus, Trash2, Eye, Heart, MessageCircle, Image,
  Video, Mic, Type, Palette, Send, AlertCircle, X, Loader,
  QrCode, Wifi, WifiOff, Phone, ChevronDown, List, ChevronLeft,
  Loader2, Shield, Zap, HelpCircle, Mail, Home, Settings, Crown,
  CheckCircle, BarChart, Play, Pause, Volume2, History
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import useWhatsappStore from '../../store/whatsappStore';
import Logo from '../../components/atoms/Logo';
import api from '../../services/api';
import { ToastProvider, useToast } from '../../components/ui/Toast';

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
  const { user, fetchMe } = useAuthStore();
  const { connection: mainConnection, fetchStatus: fetchMainStatus } = useWhatsappStore();
  
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
  const [activeTab, setActiveTab] = useState('upload'); // upload, history, scheduled, numbers
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
      
      // First check if main WhatsApp is already connected
      const existingRes = await api.get('/status-bot/check-existing');
      
      if (existingRes.data.exists && existingRes.data.isConnected) {
        // Main WhatsApp is connected - check if Status Bot connection exists
        const { data } = await api.get('/status-bot/connection');
        
        if (data.connection?.connection_status === 'connected') {
          setConnection(data.connection);
          if (data.subscription) setSubscription(data.subscription);
          setStep('dashboard');
          loadDashboardData();
        } else {
          // Main WhatsApp connected but Status Bot not yet - auto connect
          console.log('[StatusBot] Main WhatsApp connected, auto-connecting...');
          await handleConnect();
        }
      } else {
        // No main WhatsApp connection - show select page
        setStep('select');
        setExistingSession(existingRes.data);
      }
    } catch (err) {
      console.error('Check status error:', err);
      setStep('select');
      setIsCheckingExisting(true);
      await checkExisting();
      setIsCheckingExisting(false);
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
      const [numbersRes, historyRes, queueRes] = await Promise.all([
        api.get('/status-bot/authorized-numbers'),
        api.get('/status-bot/history?limit=20'),
        api.get('/status-bot/queue'),
      ]);
      
      setAuthorizedNumbers(numbersRes.data.numbers || []);
      setStatuses(historyRes.data.statuses || []);
      setQueue(queueRes.data.queue || []);
      setScheduled(queueRes.data.scheduled || []);
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

      if (useFormData) {
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
      if (recordedAudio) {
        URL.revokeObjectURL(recordedAudio);
        setRecordedAudio(null);
      }
      
      loadDashboardData();
      toast.success(scheduleMode === 'schedule' ? 'הסטטוס תוזמן בהצלחה!' : 'הסטטוס נוסף לתור!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בהעלאת סטטוס');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        toast.error('הקובץ גדול מדי. גודל מקסימלי: 100MB');
        return;
      }
      setMediaFile(file);
      setMediaUrl('');
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
        // Fetch queue and history updates
        const [historyRes, queueRes] = await Promise.all([
          api.get('/status-bot/history?limit=20'),
          api.get('/status-bot/queue'),
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
              <Logo />
              <div className="flex items-center gap-2">
                <Link 
                  to="/dashboard"
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all text-sm font-medium"
                >
                  <Home className="w-4 h-4" />
                  <span className="hidden sm:inline">דשבורד</span>
                </Link>
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
              <Logo />
              <div className="hidden md:block h-8 w-px bg-gray-200" />
              <div className="hidden md:flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                  <Upload className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-gray-800">בוט העלאת סטטוסים</span>
                <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">Pro</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Link 
                to="/dashboard"
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all text-sm font-medium"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">דשבורד</span>
              </Link>
              <Link 
                to="/settings"
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              >
                <Settings className="w-5 h-5" />
              </Link>
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
                <p className="font-medium text-amber-800">תקופת המתנה פעילה (24 שעות מההתחברות)</p>
                <p className="text-sm text-amber-600">
                  {restrictionCountdown ? (
                    <span className="font-bold tabular-nums">
                      זמן שנותר: {restrictionCountdown.hours} שעות {restrictionCountdown.minutes} דקות {restrictionCountdown.seconds} שניות
                    </span>
                  ) : (
                    'יש להמתין 24 שעות מרגע החיבור לפני שניתן להעלות סטטוסים.'
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

          {/* Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            <TabButton 
              active={activeTab === 'upload'} 
              onClick={() => setActiveTab('upload')}
              icon={Upload}
              label="העלאת סטטוס"
            />
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">כיתוב (אופציונלי)</label>
                          <textarea
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                            placeholder="כיתוב לסטטוס..."
                          />
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
                            <p className="font-medium text-blue-800">
                              {item.status_type === 'text' ? 'טקסט' : 
                               item.status_type === 'image' ? 'תמונה' : 
                               item.status_type === 'video' ? 'סרטון' : 'הקלטה'}
                            </p>
                            <p className="text-xs text-blue-600">
                              {item.status === 'processing' ? 'שולח עכשיו...' : 'ממתין בתור'}
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
                <div className="p-4 border-b border-gray-100 bg-blue-50">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <h3 className="font-bold text-gray-800">סטטוסים מתוזמנים</h3>
                  </div>
                </div>
                
                {scheduled.length === 0 ? (
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
                              <p className="font-medium text-gray-800">
                                {item.status_type === 'text' ? 'טקסט' : 
                                 item.status_type === 'image' ? 'תמונה' : 
                                 item.status_type === 'video' ? 'סרטון' : 'הקלטה'}
                              </p>
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
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <Phone className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <ClickablePhone phone={num.phone_number} className="font-medium text-gray-800" />
                          {num.name && <p className="text-sm text-gray-500">{num.name}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveNumber(num.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
                          {statusDetailsModal.status.content?.file?.url && (
                            <img 
                              src={statusDetailsModal.status.content.file.url} 
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
                          {statusDetailsModal.status.content?.file?.url && (
                            <video 
                              src={statusDetailsModal.status.content.file.url} 
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
                          {statusDetailsModal.status.content?.file?.url && (
                            <audio 
                              src={statusDetailsModal.status.content.file.url} 
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
                      ) : (
                        statusDetailsModal.views.map((view, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                <Users className="w-5 h-5 text-green-600" />
                              </div>
                              <div>
                                <ClickablePhone phone={view.viewer_phone} className="font-medium text-gray-800" />
                                {view.viewer_name && <p className="text-sm text-gray-500">{view.viewer_name}</p>}
                              </div>
                            </div>
                            <span className="text-xs text-gray-400">
                              {new Date(view.viewed_at).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                            </span>
                          </div>
                        ))
                      )}
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

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${
        active 
          ? 'bg-green-600 text-white' 
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
          <div className="flex items-center gap-2">
            <p className={`font-medium truncate ${isDeleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
              {status.status_type === 'text' 
                ? (status.content?.text?.substring(0, 40) || 'סטטוס טקסט') + (status.content?.text?.length > 40 ? '...' : '')
                : `סטטוס ${status.status_type === 'image' ? 'תמונה' : status.status_type === 'video' ? 'סרטון' : status.status_type === 'voice' ? 'קול' : status.status_type}`
              }
            </p>
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
