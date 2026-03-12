import { useState } from 'react';
import { Plus, X, Calculator, ChevronDown, ChevronUp } from 'lucide-react';

const FUNCTIONS_HELP = [
  { fn: 'UPPER(text)', desc: 'המר לאותיות גדולות' },
  { fn: 'LOWER(text)', desc: 'המר לאותיות קטנות' },
  { fn: 'TRIM(text)', desc: 'הסר רווחים' },
  { fn: 'LENGTH(text)', desc: 'אורך הטקסט' },
  { fn: 'REPLACE(text, from, to)', desc: 'החלפת טקסט' },
  { fn: 'SUBSTRING(text, start, len)', desc: 'חלק מהטקסט' },
  { fn: 'CONCAT(a, b, ...)', desc: 'חיבור טקסטים' },
  { fn: 'ROUND(num, decimals)', desc: 'עיגול מספר' },
  { fn: 'ABS(num)', desc: 'ערך מוחלט' },
  { fn: 'MIN(a, b)', desc: 'הקטן מבין שניים' },
  { fn: 'MAX(a, b)', desc: 'הגדול מבין שניים' },
  { fn: 'IF(cond, yes, no)', desc: 'ביטוי תנאי' },
  { fn: 'NOW()', desc: 'תאריך ושעה נוכחיים' },
  { fn: 'DATE_FORMAT(date, fmt)', desc: 'עיצוב תאריך' },
];

export default function FormulaEditor({ data, onUpdate }) {
  const steps = data.steps || [];
  const [showHelp, setShowHelp] = useState(false);

  const addStep = () => {
    onUpdate({ steps: [...steps, { outputVar: '', expression: '' }] });
  };

  const removeStep = (index) => {
    onUpdate({ steps: steps.filter((_, i) => i !== index) });
  };

  const updateStep = (index, field, value) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    onUpdate({ steps: newSteps });
  };

  return (
    <div className="space-y-4">
      {/* Intro */}
      <div className="bg-emerald-50 rounded-xl p-3 text-xs text-emerald-800">
        <p>כתוב ביטויי חישוב ושמור את התוצאה למשתנה. השתמש ב-<code className="bg-emerald-100 px-1 rounded">{'{{varName}}'}</code> לשימוש במשתנים קיימים.</p>
      </div>

      {/* Empty state */}
      {steps.length === 0 && (
        <div className="text-center py-6 px-4 bg-gradient-to-b from-emerald-50/50 to-white rounded-xl border-2 border-dashed border-emerald-200">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Calculator className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-gray-700 font-medium mb-1">אין שלבים עדיין</p>
          <p className="text-sm text-gray-500">הוסף שלב חישוב</p>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-emerald-700">שלב {index + 1}</span>
              <button onClick={() => removeStep(index)} className="p-1 text-gray-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Expression input */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">ביטוי / נוסחה</label>
              <textarea
                value={step.expression || ''}
                onChange={(e) => updateStep(index, 'expression', e.target.value)}
                placeholder={'למשל: {{price}} * 1.17\nאו: UPPER({{firstName}})'}
                rows={2}
                dir="ltr"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            {/* Output variable */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">שמור תוצאה למשתנה</label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-400 font-mono">{'{{'}</span>
                <input
                  type="text"
                  value={step.outputVar || ''}
                  onChange={(e) => updateStep(index, 'outputVar', e.target.value.replace(/[^a-zA-Z0-9_\u0590-\u05FF]/g, ''))}
                  placeholder="שם_משתנה"
                  dir="ltr"
                  className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
                <span className="text-sm text-gray-400 font-mono">{'}}'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add step button */}
      <button
        onClick={addStep}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        הוסף שלב חישוב
      </button>

      {/* Functions reference */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowHelp(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
        >
          <span>פונקציות זמינות</span>
          {showHelp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showHelp && (
          <div className="divide-y divide-gray-100">
            {FUNCTIONS_HELP.map(({ fn, desc }) => (
              <div key={fn} className="flex items-start gap-3 px-4 py-2">
                <code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded whitespace-nowrap">{fn}</code>
                <span className="text-xs text-gray-500">{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
