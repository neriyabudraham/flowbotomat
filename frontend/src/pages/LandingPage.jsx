import { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Bot, MessageCircle, Zap, Users, Check, ChevronLeft, Play, 
  List, Clock, BarChart3, Shield, Sparkles,
  Globe, Headphones, Workflow, Database, RefreshCw, X,
  ArrowRight, Star, TrendingUp, Award, Heart, Bell, HelpCircle, Gift, 
  Forward, Share2, Upload, Radio
} from 'lucide-react';
import api from '../services/api';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Logo from '../components/atoms/Logo';

// Custom Edge with Delete Button - Animated
function DemoEdgeWithDelete({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} style={{ stroke: '#94a3b8', strokeWidth: 2 }} className="animated" />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            onClick={() => data?.onDelete?.(id)}
            className="w-7 h-7 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center hover:bg-red-50 hover:border-red-400 transition-colors shadow-lg group"
          >
            <X className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// Custom Node Components for Demo - HORIZONTAL (Left to Right)
function DemoTriggerNode({ data }) {
  return (
    <div className="w-64 bg-white rounded-xl border-2 border-green-400 shadow-xl">
      <div className="px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-t-lg flex items-center gap-2">
        <Play className="w-5 h-5 text-white" fill="white" />
        <span className="font-bold text-white">טריגר</span>
      </div>
      <div className="p-4">
        <div className="text-xs text-gray-400 mb-1">הפעלה בעת:</div>
        <div className="text-gray-800 font-medium text-sm">{data.label}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-green-500 !w-4 !h-4 !border-2 !border-white" />
    </div>
  );
}

function DemoMessageNode({ data }) {
  return (
    <div className="w-64 bg-white rounded-xl border-2 border-blue-400 shadow-xl">
      <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-4 !h-4 !border-2 !border-white" />
      <div className="px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-t-lg flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-white" />
        <span className="font-bold text-white">הודעה</span>
      </div>
      <div className="p-4">
        <div className="bg-blue-50 rounded-lg p-3 text-sm text-gray-700 leading-relaxed">
          {data.label}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-4 !h-4 !border-2 !border-white" />
    </div>
  );
}

function DemoButtonsNode({ data }) {
  return (
    <div className="w-64 bg-white rounded-xl border-2 border-purple-400 shadow-xl">
      <Handle type="target" position={Position.Left} className="!bg-purple-500 !w-4 !h-4 !border-2 !border-white" />
      <div className="px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-t-lg flex items-center gap-2">
        <List className="w-5 h-5 text-white" />
        <span className="font-bold text-white">כפתורי בחירה</span>
      </div>
      <div className="p-4 space-y-2">
        {data.buttons?.map((btn, i) => (
          <div key={i} className="px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg text-xs text-purple-700 text-center font-medium hover:scale-105 transition-transform cursor-pointer">
            {btn}
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-purple-500 !w-4 !h-4 !border-2 !border-white" />
    </div>
  );
}

const demoNodeTypes = {
  trigger: DemoTriggerNode,
  message: DemoMessageNode,
  buttons: DemoButtonsNode,
};

const demoEdgeTypes = {
  default: DemoEdgeWithDelete,
};

// Horizontal flow - left to right (LTR)
const initialNodes = [
  {
    id: '1',
    type: 'trigger',
    position: { x: 50, y: 150 },
    data: { label: 'הודעה נכנסת מתחילה ב-"שלום"' },
  },
  {
    id: '2',
    type: 'message',
    position: { x: 370, y: 150 },
    data: { label: 'שלום! 👋 ברוכים הבאים.\nאיך אוכל לעזור?' },
  },
  {
    id: '3',
    type: 'buttons',
    position: { x: 690, y: 150 },
    data: { buttons: ['🛒 מוצרים', '⏰ שעות פתיחה', '📞 נציג'] },
  },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', type: 'default' },
  { id: 'e2-3', source: '2', target: '3', type: 'default' },
];

// Interactive Flow Demo Component
function InteractiveFlowDemo() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleDeleteEdge = useCallback((edgeId) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
  }, [setEdges]);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, type: 'default' }, eds));
  }, [setEdges]);

  // Add delete callback to edges
  const edgesWithCallbacks = edges.map(edge => ({
    ...edge,
    data: { ...edge.data, onDelete: handleDeleteEdge },
  }));

  return (
    <ReactFlow
      nodes={nodes}
      edges={edgesWithCallbacks}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={demoNodeTypes}
      edgeTypes={demoEdgeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.5}
      maxZoom={1.5}
      className="bg-gradient-to-br from-slate-50 to-blue-50"
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#cbd5e1" gap={20} size={1} />
      <Controls 
        className="!bg-white !border !border-gray-200 !rounded-xl !shadow-lg"
        showInteractive={false}
      />
    </ReactFlow>
  );
}

// Icon mapping for community links
const COMMUNITY_ICONS = {
  bell: Bell,
  help: HelpCircle,
  users: Users,
  message: MessageCircle,
  gift: Gift,
};

export default function LandingPage() {
  const navigate = useNavigate();
  const [trialDays, setTrialDays] = useState(14);
  const [siteConfig, setSiteConfig] = useState({
    trial: { enabled: false, days: 14 },
    community: { enabled: true, links: [] },
    features: { showTrialBadge: false, showCommunityLinks: true }
  });

  useEffect(() => {
    // Load public config
    api.get('/public/config').then(({ data }) => {
      if (data.config) {
        setSiteConfig(data.config);
        if (data.config.trial?.days) {
          setTrialDays(data.config.trial.days);
        }
      }
    }).catch(() => {});
  }, []);

  const services = [
    {
      icon: Bot,
      title: 'בוטים אוטומטיים',
      desc: 'צור תרחישים מורכבים עם תנאים, לופים ומשתנים. הבוט עונה ללקוחות 24/7.',
      color: 'from-blue-500 to-indigo-600',
      bg: 'bg-blue-50',
    },
    {
      icon: MessageCircle,
      title: 'חיבור WhatsApp',
      desc: 'התחבר לוואטסאפ שלך בסריקת QR פשוטה. קבל וענה להודעות דרך המערכת.',
      color: 'from-green-500 to-emerald-600',
      bg: 'bg-green-50',
    },
    {
      icon: Upload,
      title: 'בוט סטטוסים',
      desc: 'העלה סטטוסים לוואטסאפ באופן אוטומטי - תמונות, סרטונים וטקסט. תזמן מראש.',
      color: 'from-pink-500 to-rose-600',
      bg: 'bg-pink-50',
    },
    {
      icon: Forward,
      title: 'העברת הודעות בין קבוצות',
      desc: 'סנכרן הודעות בין קבוצות וואטסאפ עם זיהוי שולחים אוטומטי.',
      color: 'from-amber-500 to-orange-600',
      bg: 'bg-amber-50',
    },
    {
      icon: Radio,
      title: 'שליחת תפוצה',
      desc: 'שלח הודעות לקבוצות ולרשימות תפוצה עם תזמון ודיוור מותאם אישית.',
      color: 'from-teal-500 to-cyan-600',
      bg: 'bg-teal-50',
    },
    {
      icon: Users,
      title: 'ניהול אנשי קשר',
      desc: 'CRM מובנה - צפה בכל השיחות, סמן תוויות, וצור פילוחים חכמים.',
      color: 'from-purple-500 to-pink-600',
      bg: 'bg-purple-50',
    },
    {
      icon: Workflow,
      title: 'עורך ויזואלי',
      desc: 'עורך גרור-ושחרר אינטואיטיבי. אין צורך בידע טכני או קוד.',
      color: 'from-orange-500 to-red-600',
      bg: 'bg-orange-50',
    },
    {
      icon: Database,
      title: 'אינטגרציות חכמות',
      desc: 'חיבור ל-Google Sheets, Google Contacts, ו-API חיצוניים.',
      color: 'from-cyan-500 to-blue-600',
      bg: 'bg-cyan-50',
    },
    {
      icon: BarChart3,
      title: 'סטטיסטיקות',
      desc: 'עקוב אחר ביצועי הבוטים, שיעורי המרה, וזמני תגובה.',
      color: 'from-violet-500 to-purple-600',
      bg: 'bg-violet-50',
    },
  ];

  const benefits = [
    { value: '24/7', label: 'מענה אוטומטי ללקוחות', icon: Clock },
    { value: '80%', label: 'חיסכון בזמן טיפול', icon: TrendingUp },
    { value: '3X', label: 'יותר לידים בחודש', icon: Users },
    { value: '100%', label: 'עברית מלאה', icon: Globe },
  ];

  const testimonials = [
    {
      name: 'רון כהן',
      role: 'מנכ"ל, סטארטאפ טכנולוגי',
      content: 'Botomat שינה לנו את העסק. הלקוחות מקבלים מענה מיידי 24/7 והמכירות עלו ב-40%.',
      avatar: 'ר',
    },
    {
      name: 'מיכל לוי',
      role: 'בעלת חנות אונליין',
      content: 'פשוט לשימוש ועוזר לי לחסוך שעות עבודה כל יום. ממליצה בחום!',
      avatar: 'מ',
    },
    {
      name: 'דוד אברהם',
      role: 'יועץ עסקי',
      content: 'הבוטים האוטומטיים עזרו לי לנהל יותר לקוחות במקביל. ROI מטורף.',
      avatar: 'ד',
    },
  ];

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Logo size="md" />
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <Link to="/pricing" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
              תמחור
            </Link>
            <Link to="/login" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
              התחברות
            </Link>
            <Link 
              to="/signup"
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl transition-all text-sm font-bold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30"
            >
              התחל בחינם
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50" />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-indigo-400/20 to-cyan-400/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge - Only show if trial is enabled and showTrialBadge is true */}
            {siteConfig.features.showTrialBadge && siteConfig.trial.enabled && (
              <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 shadow-lg rounded-full text-sm font-medium mb-8">
                <Sparkles className="w-4 h-4 text-yellow-500" />
                <span className="text-gray-700">{trialDays} ימי ניסיון חינם</span>
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                <span className="text-gray-500">ביטול בכל עת</span>
              </div>
            )}
            {/* Free account badge when no trial */}
            {!siteConfig.trial.enabled && (
              <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 shadow-lg rounded-full text-sm font-medium mb-8">
                <Gift className="w-4 h-4 text-green-500" />
                <span className="text-gray-700">התחל חינם</span>
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                <span className="text-gray-500">ללא כרטיס אשראי</span>
              </div>
            )}
            
            {/* Heading */}
            <h1 className="text-5xl lg:text-6xl xl:text-7xl font-extrabold text-gray-900 mb-6 leading-tight">
              בנה בוטים ל
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">WhatsApp</span>
              <br />
              <span className="text-gray-600 text-4xl lg:text-5xl xl:text-6xl">בלי לכתוב שורת קוד</span>
            </h1>
            
            {/* Subheading */}
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              עורך ויזואלי פשוט ואינטואיטיבי שמאפשר לך ליצור בוטים חכמים, 
              לתת מענה אוטומטי ללקוחות, ולחסוך עשרות שעות עבודה בשבוע.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link 
                to="/signup"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-bold text-lg transition-all shadow-xl shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/40 hover:-translate-y-0.5"
              >
                התחל עכשיו בחינם
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link 
                to="/pricing"
                className="inline-flex items-center justify-center px-8 py-4 bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 rounded-2xl font-bold text-lg transition-all hover:shadow-lg"
              >
                צפה בתמחור
              </Link>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-500" />
                <span>אבטחה מתקדמת</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                <span>זמין 24/7</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-purple-500" />
                <span>עברית מלאה</span>
              </div>
              <div className="flex items-center gap-2">
                <Headphones className="w-5 h-5 text-orange-500" />
                <span>תמיכה מהירה</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 px-6 bg-gradient-to-r from-gray-900 to-gray-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ 
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', 
            backgroundSize: '40px 40px' 
          }} />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-10">
            <h3 className="text-2xl font-bold text-white">למה לבחור ב-Botomat?</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((benefit, i) => (
              <div key={i} className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 bg-white/10 rounded-2xl flex items-center justify-center">
                  <benefit.icon className="w-7 h-7 text-white" />
                </div>
                <div className="text-3xl lg:text-4xl font-bold text-white mb-1">{benefit.value}</div>
                <div className="text-gray-400">{benefit.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Flow Editor Demo - UNCHANGED */}
      <section className="py-20 px-6 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-4">
              <Workflow className="w-4 h-4" />
              עורך ויזואלי אינטראקטיבי
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              בנה בוטים בגרור ושחרר
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              נסה בעצמך! גרור את הבלוקים, לחץ על ה-X למחיקת חיבור
            </p>
          </div>

          {/* Flow Editor */}
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-red-400" />
                  <div className="w-3.5 h-3.5 rounded-full bg-yellow-400" />
                  <div className="w-3.5 h-3.5 rounded-full bg-green-400" />
                </div>
                <span className="text-sm font-medium text-gray-600">בוט שירות לקוחות - דוגמה אינטראקטיבית</span>
              </div>
              <Link 
                to="/signup"
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                צור בוט משלך →
              </Link>
            </div>
            
            {/* Flow Canvas */}
            <div className="h-[450px]">
              <InteractiveFlowDemo />
            </div>

            {/* Editor Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-200">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  גרור את הבלוקים • לחץ X למחיקת קו
                </span>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-400">
                <span>Scroll לזום</span>
                <span>גרור לתזוזה</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-4">
              <Zap className="w-4 h-4" />
              הפיצ'רים שלנו
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              כל מה שצריך לאוטומציה מושלמת
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              פלטפורמה אחת שמכילה את כל הכלים לניהול תקשורת אוטומטית עם הלקוחות
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service, i) => (
              <div 
                key={i} 
                className="group relative p-8 bg-white rounded-3xl border border-gray-100 hover:border-gray-200 hover:shadow-2xl transition-all duration-300"
              >
                <div className={`w-16 h-16 mb-6 bg-gradient-to-r ${service.color} rounded-2xl flex items-center justify-center transform group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg`}>
                  <service.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{service.title}</h3>
                <p className="text-gray-600 leading-relaxed">{service.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-6 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-pink-100 text-pink-700 rounded-full text-sm font-medium mb-4">
              <Heart className="w-4 h-4" />
              מה הלקוחות אומרים
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              אלפי עסקים כבר סומכים עלינו
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white p-8 rounded-3xl border border-gray-100 shadow-lg hover:shadow-xl transition-all">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 leading-relaxed">"{t.content}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {t.avatar}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{t.name}</div>
                    <div className="text-sm text-gray-500">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        </div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-full text-sm font-medium mb-6 backdrop-blur">
            <Award className="w-4 h-4" />
            הצטרף לקהילה
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            מוכנים לשדרג את העסק?
          </h2>
          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
            הצטרפו לאלפי עסקים שכבר חוסכים זמן וכסף עם בוטים אוטומטיים לוואטסאפ
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/signup"
              className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-white text-gray-900 rounded-2xl font-bold text-lg hover:bg-gray-100 transition-all shadow-2xl hover:-translate-y-0.5"
            >
              {siteConfig.trial.enabled ? `התחל ${trialDays} ימי ניסיון חינם` : 'התחל עכשיו בחינם'}
              <ChevronLeft className="w-5 h-5" />
            </Link>
          </div>
          <p className="text-white/60 text-sm mt-6">
            {siteConfig.trial.enabled 
              ? `ביטול בכל עת • תשלום רק אחרי ${trialDays} יום`
              : 'ללא כרטיס אשראי • שדרג בכל עת'}
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 pb-8 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <Logo size="md" />
              <div className="text-gray-500 text-sm">שירותי אוטומציה</div>
            </div>
            <div className="flex items-center gap-8 text-sm">
              <Link to="/pricing" className="text-gray-400 hover:text-white transition-colors">תמחור</Link>
              <Link to="/services" className="text-gray-400 hover:text-white transition-colors">שירותים נוספים</Link>
              <Link to="/terms" className="text-gray-400 hover:text-white transition-colors">תנאי שימוש</Link>
              <Link to="/privacy" className="text-gray-400 hover:text-white transition-colors">מדיניות פרטיות</Link>
              <Link to="/login" className="text-gray-400 hover:text-white transition-colors">התחברות</Link>
            </div>
          </div>
          
          {/* Community Links */}
          {siteConfig.features.showCommunityLinks && siteConfig.community.links.length > 0 && (
            <div className="py-6 border-b border-gray-800">
              <p className="text-center text-gray-400 text-sm mb-4">הצטרפו לקהילה שלנו</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {siteConfig.community.links.map((link, i) => {
                  const IconComponent = COMMUNITY_ICONS[link.icon] || Users;
                  return (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm transition-colors"
                    >
                      <IconComponent className="w-4 h-4" />
                      {link.name}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
          
          <div className="pt-8 text-center">
            <p className="text-gray-500 text-sm">
              © 2026 Botomat. כל הזכויות שמורות.
            </p>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-xl border-t border-gray-100 z-50">
        <div className="flex gap-3">
          <Link 
            to="/login"
            className="flex-1 px-4 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-bold text-center"
          >
            התחברות
          </Link>
          <Link 
            to="/signup"
            className="flex-1 px-4 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-center"
          >
            הרשמה
          </Link>
        </div>
      </div>
    </div>
  );
}
