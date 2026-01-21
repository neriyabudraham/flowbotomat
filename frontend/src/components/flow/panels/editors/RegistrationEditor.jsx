import { useState, useEffect } from 'react';
import { Plus, X, GripVertical, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
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

export default function RegistrationEditor({ data, onUpdate }) {
  const [showSummarySettings, setShowSummarySettings] = useState(false);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  
  const questions = data.questions || [];
  
  // Load WhatsApp groups
  useEffect(() => {
    if (data.sendSummary && data.summaryTarget === 'group' && groups.length === 0) {
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
  
  const addQuestion = () => {
    onUpdate({
      questions: [...questions, {
        id: Date.now(),
        question: '',
        type: 'text',
        varName: '',
        required: true,
        errorMessage: 'התשובה לא תקינה, נסה שוב',
        choices: []
      }]
    });
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        צור תהליך רישום אוטומטי עם שאלות ומיפוי תשובות.
      </p>
      
      {/* Registration Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">שם התהליך (פנימי)</label>
        <input
          type="text"
          value={data.title || ''}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="למשל: הרשמה לקורס"
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
        />
      </div>
      
      {/* Welcome Message */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">הודעת פתיחה</label>
        <TextInputWithVariables
          value={data.welcomeMessage || ''}
          onChange={(v) => onUpdate({ welcomeMessage: v })}
          placeholder="שלום! בוא נתחיל את תהליך הרישום..."
          multiline
          rows={2}
        />
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
          onClick={addQuestion}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          הוסף שאלה
        </button>
      </div>
      
      {/* Completion Message */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">הודעת סיום</label>
        <TextInputWithVariables
          value={data.completionMessage || ''}
          onChange={(v) => onUpdate({ completionMessage: v })}
          placeholder="תודה! הרישום הושלם בהצלחה."
          multiline
          rows={2}
        />
      </div>
      
      {/* Cancel Settings */}
      <div className="bg-red-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-red-700 font-medium">
          <X className="w-4 h-4" />
          הגדרות ביטול
        </div>
        <div>
          <label className="block text-xs text-red-600 mb-1">מילת ביטול</label>
          <input
            type="text"
            value={data.cancelKeyword || 'ביטול'}
            onChange={(e) => onUpdate({ cancelKeyword: e.target.value })}
            placeholder="ביטול"
            className="w-full px-3 py-2 bg-white border border-red-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-red-600 mb-1">הודעת ביטול</label>
          <TextInputWithVariables
            value={data.cancelMessage || ''}
            onChange={(v) => onUpdate({ cancelMessage: v })}
            placeholder="הרישום בוטל. נשמח לעזור בפעם אחרת!"
          />
        </div>
      </div>
      
      {/* Summary Settings */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowSummarySettings(!showSummarySettings)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-500" />
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
                <div className="font-medium text-gray-700">שלח סיכום למזכירה</div>
                <div className="text-xs text-gray-500">שלח את פרטי הרישום למספר/קבוצה</div>
              </div>
            </label>
            
            {data.sendSummary && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">יעד</label>
                  <div className="flex gap-2">
                    <button
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
                      <select
                        value={data.summaryGroupId || ''}
                        onChange={(e) => onUpdate({ summaryGroupId: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                      >
                        <option value="">בחר קבוצה...</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-sm text-gray-500 py-2">
                        לא נמצאו קבוצות.{' '}
                        <button onClick={loadGroups} className="text-indigo-600 hover:underline">רענן</button>
                      </div>
                    )}
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">תבנית סיכום</label>
                  <TextInputWithVariables
                    value={data.summaryTemplate || ''}
                    onChange={(v) => onUpdate({ summaryTemplate: v })}
                    placeholder={'📋 רישום חדש!\n\nשם: {{שם}}\nטלפון: {{טלפון}}\nמייל: {{מייל}}'}
                    multiline
                    rows={4}
                  />
                  <p className="text-xs text-gray-400 mt-1">השתמש בשמות המשתנים שהגדרת בשאלות</p>
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
          <span className="text-sm text-gray-700">ביטול → יציאה אדומה</span>
        </div>
      </div>
    </div>
  );
}

// Question Item Component
function QuestionItem({ question, index, total, onUpdate, onRemove, onMoveUp, onMoveDown }) {
  const [expanded, setExpanded] = useState(true);
  const typeInfo = questionTypes.find(t => t.id === question.type) || questionTypes[0];
  
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex flex-col">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
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
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        
        <button
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
          
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={question.required !== false}
                onChange={(e) => onUpdate({ required: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600"
              />
              <span className="text-sm text-gray-600">חובה</span>
            </label>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">הודעת שגיאה</label>
            <input
              type="text"
              value={question.errorMessage || ''}
              onChange={(e) => onUpdate({ errorMessage: e.target.value })}
              placeholder="התשובה לא תקינה, נסה שוב"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
