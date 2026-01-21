import { Plus, X, CheckCircle, AlertCircle } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import ValidationSelector from './ValidationSelector';

// WhatsApp List Limits (corrected)
const LIMITS = {
  title: 20,       // Header title - 20 chars, no emoji
  body: 1024,      // Body text
  footer: 60,      // Footer text
  buttonText: 20,  // Button text
  rowTitle: 24,    // Row title
  rowDescription: 72, // Row description
};

function ValidationBadge({ value, maxLength, label, noEmoji = false }) {
  const len = value?.length || 0;
  const hasEmoji = noEmoji && /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(value || '');
  const isValid = len > 0 && len <= maxLength && !hasEmoji;
  const isEmpty = len === 0;
  
  return (
    <div className="flex items-center justify-between text-xs mb-1">
      <span className="text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        {hasEmoji && <span className="text-red-500">ללא אימוג'י</span>}
        <span className={`flex items-center gap-1 ${
          isEmpty ? 'text-gray-400' : isValid ? 'text-green-500' : 'text-red-500'
        }`}>
          {!isEmpty && (isValid ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />)}
          {len}/{maxLength}
        </span>
      </div>
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
    const newButtons = [...buttons];
    newButtons[index] = { ...newButtons[index], ...updates };
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
      <p className="text-sm text-gray-500">צור רשימת בחירה. כל כפתור יוצר נתיב נפרד.</p>

      {/* Header */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <h4 className="font-medium text-gray-700">כותרת</h4>
        
        <div>
          <ValidationBadge value={data.title} maxLength={LIMITS.title} label="כותרת (חובה, ללא אימוג'י)" noEmoji />
          <TextInputWithVariables
            value={data.title || ''}
            onChange={(v) => onUpdate({ title: v })}
            placeholder="כותרת הרשימה..."
            maxLength={LIMITS.title}
            noEmoji
          />
        </div>

        <div>
          <ValidationBadge value={data.body} maxLength={LIMITS.body} label="תוכן ההודעה (חובה)" />
          <TextInputWithVariables
            value={data.body || ''}
            onChange={(v) => onUpdate({ body: v })}
            placeholder="תוכן ההודעה..."
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
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-200"
        />
      </div>

      {/* Buttons */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-700">אפשרויות בחירה</h4>
          <span className="text-xs text-gray-400">{buttons.length}/10</span>
        </div>

        {buttons.map((btn, index) => (
          <div key={btn.id || index} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <button 
                  onClick={() => index > 0 && moveButton(index, index - 1)}
                  disabled={index === 0}
                  className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-xs"
                >▲</button>
                <button 
                  onClick={() => index < buttons.length - 1 && moveButton(index, index + 1)}
                  disabled={index === buttons.length - 1}
                  className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-xs"
                >▼</button>
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <ValidationBadge value={btn.title} maxLength={LIMITS.rowTitle} label={`כפתור ${index + 1}`} />
                  <input
                    type="text"
                    value={btn.title || ''}
                    onChange={(e) => updateButton(index, { title: e.target.value })}
                    placeholder="כותרת הכפתור..."
                    maxLength={LIMITS.rowTitle}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <ValidationBadge value={btn.description} maxLength={LIMITS.rowDescription} label="תיאור (אופציונלי)" />
                  <input
                    type="text"
                    value={btn.description || ''}
                    onChange={(e) => updateButton(index, { description: e.target.value })}
                    placeholder="תיאור..."
                    maxLength={LIMITS.rowDescription}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <button onClick={() => removeButton(index)} className="p-2 text-gray-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
                <span className="text-xs text-gray-500">יציאה לנתיב הבא</span>
              </div>
              <ValidationSelector
                value={btn.validation ? { validationId: btn.validationId, validationName: btn.validationName } : null}
                onChange={(val) => updateButton(index, { 
                  validation: !!val,
                  validationId: val?.validationId || null,
                  validationName: val?.validationName || null
                })}
              />
            </div>
          </div>
        ))}

        {buttons.length < 10 && (
          <button
            onClick={addButton}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-cyan-300 hover:text-cyan-600 hover:bg-cyan-50 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            הוסף אפשרות
          </button>
        )}
      </div>

      {/* Single Select Option */}
      <div className="bg-purple-50 rounded-xl p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.singleSelect || false}
            onChange={(e) => onUpdate({ singleSelect: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <div>
            <div className="font-medium text-purple-700">בחירה חד פעמית</div>
            <div className="text-xs text-purple-500">אם מופעל, המשתמש יוכל לבחור רק פעם אחת. אחרת יוכל לבחור כמה פעמים שירצה.</div>
          </div>
        </label>
      </div>

      {/* Timeout (optional) */}
      <div className="bg-orange-50 rounded-xl p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.timeout !== null && data.timeout !== undefined}
            onChange={(e) => onUpdate({ timeout: e.target.checked ? 60 : null })}
            className="w-5 h-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          />
          <div>
            <div className="font-medium text-orange-700">הגבל זמן המתנה</div>
            <div className="text-xs text-orange-500">אם אין תגובה, הבוט ימשיך ליציאה "אין תגובה"</div>
          </div>
        </label>
        
        {data.timeout !== null && data.timeout !== undefined && (
          <div className="mt-3 mr-8 flex items-center gap-2">
            <input
              type="number"
              value={data.timeout || 60}
              onChange={(e) => onUpdate({ timeout: parseInt(e.target.value) || 60 })}
              min={10}
              max={3600}
              className="w-20 px-3 py-2 bg-white border border-orange-200 rounded-lg text-sm text-center"
            />
            <span className="text-sm text-orange-600">שניות</span>
          </div>
        )}
      </div>

      {/* Limits Info */}
      <details className="bg-blue-50 rounded-xl p-4">
        <summary className="font-medium text-blue-700 cursor-pointer">מגבלות WhatsApp</summary>
        <ul className="text-xs text-blue-600 space-y-1 mt-2">
          <li>• כותרת: {LIMITS.title} תווים, ללא אימוג'י</li>
          <li>• תוכן: {LIMITS.body} תווים</li>
          <li>• פוטר: {LIMITS.footer} תווים</li>
          <li>• טקסט כפתור: {LIMITS.buttonText} תווים</li>
          <li>• כותרת אפשרות: {LIMITS.rowTitle} תווים</li>
          <li>• תיאור אפשרות: {LIMITS.rowDescription} תווים</li>
          <li>• מקסימום 10 אפשרויות</li>
        </ul>
      </details>
    </div>
  );
}
