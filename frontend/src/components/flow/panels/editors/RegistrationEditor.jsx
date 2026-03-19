import { useState, useEffect } from 'react';
import { Plus, X, ChevronDown, ChevronUp, Settings, Zap, Clock, Send, FileText, Copy, Shield } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import ValidationSelector from './ValidationSelector';
import api from '../../../../services/api';

const questionTypes = [
  { id: 'text', label: 'טקסט חופשי', icon: '📝' },
  { id: 'number', label: 'מספר', icon: '🔢' },
  { id: 'phone', label: 'מספר טלפון', icon: '📱' },
  { id: 'email', label: 'כתובת מייל', icon: '📧' },
  { id: 'choice', label: 'בחירה מרשימה', icon: '📋' },
  { id: 'date', label: 'תאריך', icon: '📅' },
  { id: 'image', label: 'תמונה', icon: '🖼️' },
  { id: 'file', label: 'קובץ', icon: '📎' },
];

// Quick questions templates
const quickQuestions = [
  { id: 'full_name', label: 'שם מלא', question: 'מה השם המלא שלך?', type: 'text', varName: 'full_name' },
  { id: 'first_name', label: 'שם פרטי', question: 'מה השם הפרטי שלך?', type: 'text', varName: 'first_name' },
  { id: 'last_name', label: 'שם משפחה', question: 'מה שם המשפחה שלך?', type: 'text', varName: 'last_name' },
  { id: 'phone', label: 'טלפון', question: 'מה מספר הטלפון שלך?', type: 'phone', varName: 'phone' },
  { id: 'email', label: 'מייל', question: 'מה כתובת המייל שלך?', type: 'email', varName: 'email' },
  { id: 'id_number', label: 'תעודת זהות', question: 'מה מספר תעודת הזהות שלך?', type: 'number', varName: 'id_number' },
  { id: 'city', label: 'עיר', question: 'באיזו עיר אתה גר?', type: 'text', varName: 'city' },
  { id: 'address', label: 'כתובת', question: 'מה הכתובת המלאה שלך?', type: 'text', varName: 'address' },
  { id: 'birthday', label: 'תאריך לידה', question: 'מה תאריך הלידה שלך?', type: 'date', varName: 'birthday' },
  { id: 'company', label: 'חברה', question: 'באיזו חברה אתה עובד?', type: 'text', varName: 'company' },
];

// Default messages
const DEFAULT_TIMEOUT_MESSAGE = 'לא קיבלנו תשובה. תהליך הרישום בוטל. נשמח לעזור בפעם אחרת!';
const DEFAULT_CANCEL_MESSAGE = 'הרישום בוטל. נשמח לעזור בפעם אחרת!';
const DEFAULT_COMPLETION_MESSAGE = 'תודה! הרישום הושלם בהצלחה. 🎉';

export default function RegistrationEditor({ data, onUpdate }) {
  const [showSummarySettings, setShowSummarySettings] = useState(false);
  const [showTimeoutSettings, setShowTimeoutSettings] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showWebhookSettings, setShowWebhookSettings] = useState(false);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  
  const questions = data.questions || [];
  
  // Load WhatsApp groups
  useEffect(() => {
    if (data.sendSummary && data.summaryTarget === 'group') {
      loadGroups();
    }
  }, [data.sendSummary, data.summaryTarget]);
  
  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await api.get('/whatsapp/groups');
      setGroups(res.data.groups || []);
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
    setLoadingGroups(false);
  };
  
  const addQuestion = (template = null) => {
    const newQuestion = template ? {
      id: Date.now(),
      question: template.question,
      type: template.type,
      varName: template.varName,
      required: true,
      errorMessage: 'התשובה לא תקינה, נסה שוב',
      choices: [],
      expanded: false // Collapsed by default for quick add
    } : {
      id: Date.now(),
      question: '',
      type: 'text',
      varName: '',
      required: true,
      errorMessage: 'התשובה לא תקינה, נסה שוב',
      choices: [],
      expanded: true // Expanded for manual add
    };
    
    onUpdate({ questions: [...questions, newQuestion] });
    setShowQuickAdd(false);
  };
  
  const updateQuestion = (index, updates) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    onUpdate({ questions: newQuestions });
  };
  
  const removeQuestion = (index) => {
    onUpdate({ questions: questions.filter((_, i) => i !== index) });
  };
  
  const moveQuestion = (from, to) => {
    if (to < 0 || to >= questions.length) return;
    const newQuestions = [...questions];
    const [removed] = newQuestions.splice(from, 1);
    newQuestions.splice(to, 0, removed);
    onUpdate({ questions: newQuestions });
  };
  
  // Label mapping for common variables
  const labelMap = {
    full_name: 'שם מלא',
    first_name: 'שם פרטי',
    last_name: 'שם משפחה',
    phone: 'טלפון',
    email: 'אימייל',
    id_number: 'תעודת זהות',
    city: 'עיר',
    address: 'כתובת',
    birthday: 'תאריך לידה',
    company: 'חברה',
  };
  
  // Get label for variable
  const getLabel = (varName, question) => {
    // First check quick questions
    const quickQ = quickQuestions.find(qQ => qQ.varName === varName);
    if (quickQ?.label) return quickQ.label;
    
    // Then check label map
    if (labelMap[varName]) return labelMap[varName];
    
    // Then try to extract from question text
    if (question) {
      const cleanQuestion = question.replace(/\?$/, '').trim();
      // Try to get a short label from "מה ה... שלך" pattern
      const match = cleanQuestion.match(/מה ה?(.+?) שלך/);
      if (match) return match[1].trim();
      // Otherwise use the full question (up to 20 chars)
      if (cleanQuestion.length <= 25) return cleanQuestion;
    }
    
    return varName;
  };

  // Generate quick summary template
  const generateQuickSummary = () => {
    let template = `📋 *רישום חדש*\n\n`;
    template += `🔹 תהליך: {{registration_title}}\n`;
    template += `🔹 מטלפון: {{contact_phone}}\n\n`;
    
    questions.forEach(q => {
      if (q.varName) {
        const label = getLabel(q.varName, q.question);
        template += `*${label}:* {{${q.varName}}}\n`;
      }
    });
    return template;
  };
  
  // Generate quick webhook body
  const generateQuickWebhookBody = () => {
    const body = {
      registration_title: '{{registration_title}}',
      contact_phone: '{{contact_phone}}',
      contact_name: '{{name}}',
      timestamp: '{{date}} {{time}}',
      answers: {}
    };
    questions.forEach(q => {
      if (q.varName) {
        body.answers[q.varName] = `{{${q.varName}}}`;
      }
    });
    return JSON.stringify(body, null, 2);
  };
  
  // Filter groups by participant count
  const displayedGroups = showAllGroups 
    ? groups 
    : groups.filter(g => g.participants <= 10);
  
  const hasMoreGroups = groups.some(g => g.participants > 10);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        צור תהליך רישום אוטומטי עם שאלות ומיפוי תשובות.
      </p>
      
      {/* Registration Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">שם התהליך</label>
        <TextInputWithVariables
          value={data.title || ''}
          onChange={(val) => onUpdate({ title: val })}
          placeholder="למשל: הרשמה לקורס"
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
        />
      </div>
      
      {/* Welcome Message (Optional) */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
          הודעת פתיחה
          <span className="text-xs text-gray-400 font-normal">(אופציונלי)</span>
        </label>
        <TextInputWithVariables
          value={data.welcomeMessage || ''}
          onChange={(v) => onUpdate({ welcomeMessage: v })}
          placeholder="שלום! בוא נתחיל את תהליך הרישום... (השאר ריק לדילוג)"
          multiline
          rows={2}
        />
        {data.welcomeMessage && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-gray-500">השהייה לפני השאלה הראשונה:</label>
            <input
              type="number"
              value={data.welcomeDelay ?? 2}
              onChange={(e) => onUpdate({ welcomeDelay: parseInt(e.target.value) || 2 })}
              min={0}
              max={30}
              className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-sm text-center"
            />
            <span className="text-xs text-gray-500">שניות</span>
          </div>
        )}
      </div>
      
      {/* Quick Add Questions */}
      <div className="border border-indigo-200 rounded-xl overflow-hidden bg-indigo-50">
        <button
          type="button"
          onClick={() => setShowQuickAdd(!showQuickAdd)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-indigo-100"
        >
          <div className="flex items-center gap-2 text-indigo-700">
            <Zap className="w-4 h-4" />
            <span className="font-medium">הוספה מהירה</span>
          </div>
          {showQuickAdd ? <ChevronUp className="w-4 h-4 text-indigo-500" /> : <ChevronDown className="w-4 h-4 text-indigo-500" />}
        </button>
        
        {showQuickAdd && (
          <div className="p-3 border-t border-indigo-200 bg-white">
            <div className="grid grid-cols-2 gap-2">
              {quickQuestions.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => addQuestion(q)}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-indigo-50 rounded-lg text-sm transition-colors"
                >
                  <span className="text-indigo-600">+</span>
                  <span>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Questions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">שאלות</label>
          <span className="text-xs text-gray-400">{questions.length} שאלות</span>
        </div>
        
        {questions.map((question, index) => (
          <QuestionItem
            key={question.id || index}
            question={question}
            index={index}
            total={questions.length}
            onUpdate={(updates) => updateQuestion(index, updates)}
            onRemove={() => removeQuestion(index)}
            onMoveUp={() => moveQuestion(index, index - 1)}
            onMoveDown={() => moveQuestion(index, index + 1)}
          />
        ))}
        
        <button
          type="button"
          onClick={() => addQuestion()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          הוסף שאלה חדשה
        </button>
      </div>
      
      {/* Completion Message */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">הודעת סיום</label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.sendCompletionMessage !== false}
              onChange={(e) => onUpdate({ sendCompletionMessage: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-xs text-gray-500">שלח הודעה</span>
          </label>
        </div>
        {data.sendCompletionMessage !== false && (
          <TextInputWithVariables
            value={data.completionMessage ?? DEFAULT_COMPLETION_MESSAGE}
            onChange={(v) => onUpdate({ completionMessage: v })}
            placeholder={DEFAULT_COMPLETION_MESSAGE}
            multiline
            rows={2}
          />
        )}
        {data.sendCompletionMessage === false && (
          <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">לא תישלח הודעת סיום — הפלאו ימשיך ישירות לצומת הבא.</p>
        )}
      </div>
      
      {/* Timeout Settings */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTimeoutSettings(!showTimeoutSettings)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="font-medium text-gray-700">טיימאאוט (אי מענה)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {data.timeout || 2} {(data.timeoutUnit || 'hours') === 'hours' ? 'שעות' : 'דקות'}
            </span>
            {showTimeoutSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
        
        {showTimeoutSettings && (
          <div className="p-4 space-y-4 bg-white">
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={data.timeout || 2}
                onChange={(e) => onUpdate({ timeout: parseInt(e.target.value) || 2 })}
                min={1}
                className="w-20 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center"
              />
              <select
                value={data.timeoutUnit || 'hours'}
                onChange={(e) => onUpdate({ timeoutUnit: e.target.value })}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
              >
                <option value="minutes">דקות</option>
                <option value="hours">שעות</option>
              </select>
              <span className="text-sm text-gray-500">המתנה לתגובה</span>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">הודעה בעת טיימאאוט</label>
              <TextInputWithVariables
                value={data.timeoutMessage ?? DEFAULT_TIMEOUT_MESSAGE}
                onChange={(v) => onUpdate({ timeoutMessage: v })}
                placeholder={DEFAULT_TIMEOUT_MESSAGE}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Cancel Settings */}
      <div className="bg-red-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-red-700 font-medium">
          <X className="w-4 h-4" />
          הגדרות ביטול
        </div>
        <div>
          <label className="block text-xs text-red-600 mb-1">מילת ביטול</label>
          <TextInputWithVariables
            value={data.cancelKeyword || 'ביטול'}
            onChange={(val) => onUpdate({ cancelKeyword: val })}
            placeholder="ביטול"
            className="w-full px-3 py-2 bg-white border border-red-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-red-600 mb-1">הודעת ביטול</label>
          <TextInputWithVariables
            value={data.cancelMessage ?? DEFAULT_CANCEL_MESSAGE}
            onChange={(v) => onUpdate({ cancelMessage: v })}
            placeholder={DEFAULT_CANCEL_MESSAGE}
          />
        </div>
      </div>
      
      {/* Summary Settings */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSummarySettings(!showSummarySettings)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="font-medium text-gray-700">שליחת סיכום</span>
          </div>
          <div className="flex items-center gap-2">
            {data.sendSummary && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">פעיל</span>
            )}
            {showSummarySettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
        
        {showSummarySettings && (
          <div className="p-4 space-y-4 bg-white">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data.sendSummary || false}
                onChange={(e) => onUpdate({ sendSummary: e.target.checked })}
                className="w-5 h-5 rounded border-gray-300 text-indigo-600"
              />
              <div>
                <div className="font-medium text-gray-700">שלח סיכום</div>
                <div className="text-xs text-gray-500">שלח את פרטי הרישום למספר/קבוצה</div>
              </div>
            </label>
            
            {data.sendSummary && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">יעד</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdate({ summaryTarget: 'phone' })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        (data.summaryTarget || 'phone') === 'phone'
                          ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      📱 מספר טלפון
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdate({ summaryTarget: 'group' });
                        if (groups.length === 0) loadGroups();
                      }}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        data.summaryTarget === 'group'
                          ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      👥 קבוצת WhatsApp
                    </button>
                  </div>
                </div>
                
                {(data.summaryTarget || 'phone') === 'phone' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">מספר טלפון</label>
                    <input
                      type="tel"
                      value={data.summaryPhone || ''}
                      onChange={(e) => onUpdate({ summaryPhone: e.target.value })}
                      placeholder="972500000000"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                      dir="ltr"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">קבוצה</label>
                    {loadingGroups ? (
                      <div className="text-sm text-gray-500 py-2">טוען קבוצות...</div>
                    ) : groups.length > 0 ? (
                      <>
                        <select
                          value={data.summaryGroupId || ''}
                          onChange={(e) => onUpdate({ summaryGroupId: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                        >
                          <option value="">בחר קבוצה...</option>
                          {displayedGroups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name} ({group.participants} משתתפים)
                            </option>
                          ))}
                        </select>
                        {hasMoreGroups && !showAllGroups && (
                          <button
                            type="button"
                            onClick={() => setShowAllGroups(true)}
                            className="mt-2 text-xs text-indigo-600 hover:underline"
                          >
                            הצג את כל הקבוצות ({groups.length})
                          </button>
                        )}
                        {showAllGroups && (
                          <button
                            type="button"
                            onClick={() => setShowAllGroups(false)}
                            className="mt-2 text-xs text-gray-500 hover:underline"
                          >
                            הצג רק קבוצות קטנות
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-gray-500 py-2">
                        לא נמצאו קבוצות.{' '}
                        <button type="button" onClick={loadGroups} className="text-indigo-600 hover:underline">רענן</button>
                      </div>
                    )}
                  </div>
                )}
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">תבנית סיכום</label>
                  <TextInputWithVariables
                    value={data.summaryTemplate ?? generateQuickSummary()}
                    onChange={(v) => onUpdate({ summaryTemplate: v })}
                    placeholder={generateQuickSummary()}
                    multiline
                    rows={6}
                  />
                  <p className="text-xs text-gray-400 mt-1">התבנית מתעדכנת אוטומטית לפי השאלות</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Webhook Settings */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowWebhookSettings(!showWebhookSettings)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100"
        >
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-gray-500" />
            <span className="font-medium text-gray-700">שליחה לוובהוק</span>
          </div>
          <div className="flex items-center gap-2">
            {data.sendWebhook && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">פעיל</span>
            )}
            {showWebhookSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
        
        {showWebhookSettings && (
          <div className="p-4 space-y-4 bg-white">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data.sendWebhook || false}
                onChange={(e) => onUpdate({ sendWebhook: e.target.checked })}
                className="w-5 h-5 rounded border-gray-300 text-blue-600"
              />
              <div>
                <div className="font-medium text-gray-700">שלח לוובהוק</div>
                <div className="text-xs text-gray-500">שלח את הנתונים ל-URL חיצוני</div>
              </div>
            </label>
            
            {data.sendWebhook && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">כתובת URL</label>
                  <input
                    type="url"
                    value={data.webhookUrl || ''}
                    onChange={(e) => onUpdate({ webhookUrl: e.target.value })}
                    placeholder="https://example.com/webhook"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                    dir="ltr"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">גוף הבקשה (JSON)</label>
                  <TextInputWithVariables
                    value={data.webhookBody ?? generateQuickWebhookBody()}
                    onChange={(v) => onUpdate({ webhookBody: v })}
                    placeholder={generateQuickWebhookBody()}
                    multiline
                    rows={8}
                    dir="ltr"
                    className="font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">התבנית מתעדכנת אוטומטית לפי השאלות</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Output Info */}
      <div className="bg-indigo-50 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-green-500"></span>
          <span className="text-sm text-gray-700">סיום מוצלח → יציאה ירוקה</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-red-500"></span>
          <span className="text-sm text-gray-700">ביטול / טיימאאוט → יציאה אדומה</span>
        </div>
      </div>
    </div>
  );
}

// Question Item Component
function QuestionItem({ question, index, total, onUpdate, onRemove, onMoveUp, onMoveDown }) {
  const [expanded, setExpanded] = useState(question.expanded !== false);
  const typeInfo = questionTypes.find(t => t.id === question.type) || questionTypes[0];
  
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
        
        <span className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-xs">
          {index + 1}
        </span>
        
        <span className="text-lg">{typeInfo.icon}</span>
        
        <span className="flex-1 text-sm text-gray-700 truncate">
          {question.question || `שאלה ${index + 1}`}
        </span>
        
        {question.varName && (
          <span className="text-xs text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">
            → {question.varName}
          </span>
        )}
        
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-gray-400 hover:text-red-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
      {/* Content */}
      {expanded && (
        <div className="p-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">טקסט השאלה</label>
            <TextInputWithVariables
              value={question.question || ''}
              onChange={(v) => onUpdate({ question: v })}
              placeholder="מה השם שלך?"
              multiline
              rows={2}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">סוג תשובה</label>
              <select
                value={question.type || 'text'}
                onChange={(e) => onUpdate({ type: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
              >
                {questionTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">שמור במשתנה</label>
              <input
                type="text"
                value={question.varName || ''}
                onChange={(e) => onUpdate({ varName: e.target.value })}
                placeholder="שם_המשתנה"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
          
          {question.type === 'choice' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">אפשרויות (שורה לכל אפשרות)</label>
              <textarea
                value={(question.choices || []).join('\n')}
                onChange={(e) => onUpdate({ choices: e.target.value.split('\n').filter(c => c.trim()) })}
                placeholder="אפשרות 1&#10;אפשרות 2&#10;אפשרות 3"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm resize-none"
                rows={3}
              />
            </div>
          )}
          
          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={question.required !== false}
                onChange={(e) => onUpdate({ required: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600"
              />
              <span className="text-sm text-gray-600">חובה</span>
            </label>
            
            {/* Validation - skip question if API returns false */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">דלג על שאלה אם:</span>
              <ValidationSelector
                value={question.validation ? { validationId: question.validationId, validationName: question.validationName } : null}
                onChange={(val) => onUpdate({ 
                  validation: !!val,
                  validationId: val?.validationId || null,
                  validationName: val?.validationName || null
                })}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">הודעת שגיאה</label>
            <TextInputWithVariables
              value={question.errorMessage || ''}
              onChange={(val) => onUpdate({ errorMessage: val })}
              placeholder="התשובה לא תקינה, נסה שוב"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
