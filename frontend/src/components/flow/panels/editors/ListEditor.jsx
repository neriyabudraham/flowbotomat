import { Plus, X, GripVertical, AlertCircle, CheckCircle } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';

// WhatsApp List Limits
const LIMITS = {
  title: 60,
  body: 1024,
  footer: 60,
  buttonText: 20,
  sectionTitle: 24,
  rowTitle: 24,
  rowDescription: 72,
};

function ValidationBadge({ value, maxLength, label }) {
  const len = value?.length || 0;
  const isValid = len > 0 && len <= maxLength;
  const isEmpty = len === 0;
  
  return (
    <div className="flex items-center justify-between text-xs mb-1">
      <span className="text-gray-500">{label}</span>
      <span className={`flex items-center gap-1 ${
        isEmpty ? 'text-gray-400' : isValid ? 'text-green-500' : 'text-red-500'
      }`}>
        {isEmpty ? null : isValid ? (
          <CheckCircle className="w-3 h-3" />
        ) : (
          <AlertCircle className="w-3 h-3" />
        )}
        {len}/{maxLength}
      </span>
    </div>
  );
}

export default function ListEditor({ data, onUpdate }) {
  const buttons = data.buttons || [];
  
  const addButton = () => {
    const newButton = {
      id: `btn_${Date.now()}`,
      title: '',
      description: '',
    };
    onUpdate({ buttons: [...buttons, newButton] });
  };

  const updateButton = (index, updates) => {
    const newButtons = buttons.map((b, i) => i === index ? { ...b, ...updates } : b);
    onUpdate({ buttons: newButtons });
  };

  const removeButton = (index) => {
    onUpdate({ buttons: buttons.filter((_, i) => i !== index) });
  };

  const moveButton = (from, to) => {
    const newButtons = [...buttons];
    const [removed] = newButtons.splice(from, 1);
    newButtons.splice(to, 0, removed);
    onUpdate({ buttons: newButtons });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        צור רשימת בחירה אינטראקטיבית. כל כפתור יוצר נתיב נפרד.
      </p>

      {/* Header Section */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <h4 className="font-medium text-gray-700">כותרת הרשימה</h4>
        
        <div>
          <ValidationBadge value={data.title} maxLength={LIMITS.title} label="כותרת (חובה)" />
          <TextInputWithVariables
            value={data.title || ''}
            onChange={(v) => onUpdate({ title: v })}
            placeholder="כותרת הרשימה..."
            maxLength={LIMITS.title}
          />
        </div>

        <div>
          <ValidationBadge value={data.body} maxLength={LIMITS.body} label="תוכן ההודעה (חובה)" />
          <TextInputWithVariables
            value={data.body || ''}
            onChange={(v) => onUpdate({ body: v })}
            placeholder="תוכן ההודעה שתוצג..."
            maxLength={LIMITS.body}
            multiline
            rows={3}
          />
        </div>

        <div>
          <ValidationBadge value={data.footer} maxLength={LIMITS.footer} label="פוטר (אופציונלי)" />
          <TextInputWithVariables
            value={data.footer || ''}
            onChange={(v) => onUpdate({ footer: v })}
            placeholder="טקסט תחתון..."
            maxLength={LIMITS.footer}
          />
        </div>
      </div>

      {/* Button Text */}
      <div>
        <ValidationBadge value={data.buttonText} maxLength={LIMITS.buttonText} label="טקסט הכפתור" />
        <input
          type="text"
          value={data.buttonText || ''}
          onChange={(e) => onUpdate({ buttonText: e.target.value })}
          placeholder="לדוגמה: בחר אפשרות"
          maxLength={LIMITS.buttonText}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-200 outline-none"
        />
      </div>

      {/* Buttons/Rows */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-700">אפשרויות בחירה</h4>
          <span className="text-xs text-gray-400">עד 10 אפשרויות</span>
        </div>

        {buttons.map((btn, index) => (
          <div 
            key={btn.id || index} 
            className="bg-white border border-gray-200 rounded-xl p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => index > 0 && moveButton(index, index - 1)}
                  disabled={index === 0}
                  className="text-gray-300 hover:text-gray-500 disabled:opacity-30"
                >
                  ▲
                </button>
                <button 
                  onClick={() => index < buttons.length - 1 && moveButton(index, index + 1)}
                  disabled={index === buttons.length - 1}
                  className="text-gray-300 hover:text-gray-500 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <ValidationBadge value={btn.title} maxLength={LIMITS.rowTitle} label={`אפשרות ${index + 1} - כותרת`} />
                  <input
                    type="text"
                    value={btn.title || ''}
                    onChange={(e) => updateButton(index, { title: e.target.value })}
                    placeholder="כותרת האפשרות..."
                    maxLength={LIMITS.rowTitle}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-200 outline-none"
                  />
                </div>
                <div>
                  <ValidationBadge value={btn.description} maxLength={LIMITS.rowDescription} label="תיאור (אופציונלי)" />
                  <input
                    type="text"
                    value={btn.description || ''}
                    onChange={(e) => updateButton(index, { description: e.target.value })}
                    placeholder="תיאור קצר..."
                    maxLength={LIMITS.rowDescription}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-200 outline-none"
                  />
                </div>
              </div>
              <button 
                onClick={() => removeButton(index)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Output indicator */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
              <span className="text-xs text-gray-500">יציאה לנתיב הבא</span>
            </div>
          </div>
        ))}

        {buttons.length < 10 && (
          <button
            onClick={addButton}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-cyan-300 hover:text-cyan-600 hover:bg-cyan-50 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            הוסף אפשרות
          </button>
        )}
      </div>

      {/* Timeout */}
      <div className="bg-orange-50 rounded-xl p-4">
        <h4 className="font-medium text-orange-700 mb-2">זמן המתנה לתגובה</h4>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={data.timeout || 60}
            onChange={(e) => onUpdate({ timeout: parseInt(e.target.value) || 60 })}
            min={10}
            max={3600}
            className="w-20 px-3 py-2 bg-white border border-orange-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-orange-200 outline-none"
          />
          <span className="text-sm text-orange-600">שניות</span>
        </div>
        <p className="text-xs text-orange-500 mt-2">
          אם אין תגובה, הבוט ימשיך ליציאה "אין תגובה"
        </p>
      </div>

      {/* WhatsApp Limits Info */}
      <div className="bg-blue-50 rounded-xl p-4">
        <h4 className="font-medium text-blue-700 mb-2">מגבלות WhatsApp</h4>
        <ul className="text-xs text-blue-600 space-y-1">
          <li>• כותרת: עד {LIMITS.title} תווים</li>
          <li>• תוכן: עד {LIMITS.body} תווים</li>
          <li>• טקסט כפתור: עד {LIMITS.buttonText} תווים</li>
          <li>• כותרת אפשרות: עד {LIMITS.rowTitle} תווים</li>
          <li>• מקסימום 10 אפשרויות</li>
        </ul>
      </div>
    </div>
  );
}
