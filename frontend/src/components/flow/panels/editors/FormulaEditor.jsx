import { useState, useEffect, useRef } from 'react';
import { Plus, X, Calculator, ChevronDown, ChevronUp, Hash, Search, Loader2, Check } from 'lucide-react';
import api from '../../../../services/api';

// ─── constants ────────────────────────────────────────────────────────────────

const OPERATORS = [
  { id: '+', symbol: '+', label: 'חיבור' },
  { id: '-', symbol: '−', label: 'חיסור' },
  { id: '*', symbol: '×', label: 'כפל' },
  { id: '/', symbol: '÷', label: 'חילוק' },
];

const FUNCTIONS_HELP = [
  { fn: 'UPPER({{var}})', desc: 'המר לאותיות גדולות' },
  { fn: 'LOWER({{var}})', desc: 'המר לאותיות קטנות' },
  { fn: 'TRIM({{var}})', desc: 'הסר רווחים' },
  { fn: 'LENGTH({{var}})', desc: 'אורך הטקסט' },
  { fn: 'CONCAT({{a}}, " ", {{b}})', desc: 'חיבור טקסטים' },
  { fn: 'ROUND({{num}}, 2)', desc: 'עיגול מספר' },
  { fn: 'ABS({{num}})', desc: 'ערך מוחלט' },
  { fn: 'IF({{x}} > 0, "כן", "לא")', desc: 'ביטוי תנאי' },
  { fn: 'NOW()', desc: 'תאריך ושעה נוכחיים' },
];

function buildArithmeticExpression(inputVar, operator, operand) {
  const left = inputVar ? `{{${inputVar}}}` : '0';
  const right = operand !== '' ? operand : '0';
  return `${left} ${operator} ${right}`;
}

// ─── VarPicker: inline combobox for variable selection ────────────────────────

function VarPicker({ value, onChange, placeholder = 'בחר משתנה', allowNew = true }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [vars, setVars] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');
  const ref = useRef(null);

  // Load variables when opened
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get('/variables').then(res => {
      const sys = (res.data.systemVariables || []).map(v => ({ key: v.name, label: v.label || v.name, group: 'system' }));
      const usr = (res.data.userVariables || []).map(v => ({ key: v.name, label: v.label || v.name, group: 'user' }));
      setVars([...usr, ...sys]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowCreate(false); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = vars.filter(v =>
    v.key.toLowerCase().includes(search.toLowerCase()) ||
    v.label.toLowerCase().includes(search.toLowerCase())
  );
  const userVars = filtered.filter(v => v.group === 'user');
  const sysVars = filtered.filter(v => v.group === 'system');

  const handleSelect = (key) => {
    onChange(key);
    setOpen(false);
    setSearch('');
    setShowCreate(false);
  };

  const handleLabelChange = (val) => {
    setNewLabel(val);
    setNewKey(val.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  };

  const handleCreate = async () => {
    if (!newKey.trim()) { setCreateErr('יש להזין מזהה'); return; }
    setCreating(true);
    setCreateErr('');
    try {
      await api.post('/variables', { name: newKey.trim(), label: newLabel.trim() || newKey.trim(), is_system: false });
      handleSelect(newKey.trim());
      setNewLabel(''); setNewKey('');
    } catch (err) {
      setCreateErr(err.response?.data?.error || 'שגיאה');
    } finally { setCreating(false); }
  };

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setShowCreate(false); }}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all text-right ${
          value
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
            : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-emerald-300 hover:bg-emerald-50/50'
        }`}
      >
        {value ? (
          <>
            <span className="text-emerald-400 font-mono text-xs shrink-0">{'{{'}</span>
            <span className="flex-1 font-mono text-emerald-700 font-medium truncate" dir="ltr">{value}</span>
            <span className="text-emerald-400 font-mono text-xs shrink-0">{'}}'}</span>
          </>
        ) : (
          <>
            <Hash className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 truncate">{placeholder}</span>
          </>
        )}
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform text-gray-400 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חפש משתנה..."
                className="w-full pr-8 pl-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-200 outline-none"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4 gap-2 text-gray-400 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> טוען...
              </div>
            ) : (
              <>
                {userVars.length > 0 && (
                  <div className="p-1.5">
                    <div className="text-[10px] font-semibold text-blue-400 px-2 py-1 uppercase tracking-wide">המשתנים שלי</div>
                    {userVars.map(v => (
                      <button key={v.key} type="button" onClick={() => handleSelect(v.key)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors text-right">
                        <Hash className="w-3 h-3 text-blue-500 shrink-0" />
                        <span className="flex-1 text-sm text-gray-700">{v.label}</span>
                        <code className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">{v.key}</code>
                        {value === v.key && <Check className="w-3 h-3 text-emerald-500 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
                {sysVars.length > 0 && (
                  <div className={`p-1.5 ${userVars.length > 0 ? 'border-t border-gray-100' : ''}`}>
                    <div className="text-[10px] font-semibold text-teal-400 px-2 py-1 uppercase tracking-wide">משתני מערכת</div>
                    {sysVars.map(v => (
                      <button key={v.key} type="button" onClick={() => handleSelect(v.key)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-teal-50 transition-colors text-right">
                        <Hash className="w-3 h-3 text-teal-500 shrink-0" />
                        <span className="flex-1 text-sm text-gray-700">{v.label}</span>
                        <code className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">{v.key}</code>
                        {value === v.key && <Check className="w-3 h-3 text-emerald-500 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
                {filtered.length === 0 && !showCreate && (
                  <div className="py-3 text-center text-xs text-gray-400">לא נמצאו משתנים</div>
                )}
              </>
            )}
          </div>

          {/* Create new */}
          {allowNew && (
            <div className="border-t border-gray-100 p-2 bg-gray-50">
              {!showCreate ? (
                <button type="button" onClick={() => setShowCreate(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium">
                  <Plus className="w-3.5 h-3.5" /> משתנה חדש
                </button>
              ) : (
                <div className="space-y-1.5">
                  <input type="text" value={newLabel} onChange={e => handleLabelChange(e.target.value)}
                    placeholder="שם (עברית)" autoFocus
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 outline-none" />
                  <input type="text" value={newKey} onChange={e => setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="מזהה (אנגלית)" dir="ltr"
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 outline-none font-mono" />
                  {createErr && <p className="text-[10px] text-red-500">{createErr}</p>}
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => { setShowCreate(false); setNewLabel(''); setNewKey(''); setCreateErr(''); }}
                      className="flex-1 py-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">ביטול</button>
                    <button type="button" onClick={handleCreate} disabled={!newKey.trim() || creating}
                      className="flex-1 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                      {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} צור
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── StepCard ─────────────────────────────────────────────────────────────────

function StepCard({ step, index, onUpdate, onRemove, onSwitchMode }) {
  const isArithmetic = (step.mode || 'arithmetic') === 'arithmetic';
  const op = step.operator || '+';

  const updateArith = (field, value) => {
    const next = { ...step, [field]: value };
    if (field === 'inputVar' && !step.outputVar) next.outputVar = value;
    next.expression = buildArithmeticExpression(
      field === 'inputVar' ? value : next.inputVar,
      field === 'operator' ? value : next.operator,
      field === 'operand' ? value : next.operand,
    );
    onUpdate(next);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500">שלב {index + 1}</span>
        {/* Mode pills */}
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-[11px] ml-auto">
          <button type="button" onClick={() => onSwitchMode('arithmetic')}
            className={`flex items-center gap-1 px-2 py-1 transition-colors ${isArithmetic ? 'bg-emerald-500 text-white font-medium' : 'text-gray-400 hover:bg-gray-100'}`}>
            ⚡ חישוב
          </button>
          <button type="button" onClick={() => onSwitchMode('expression')}
            className={`flex items-center gap-1 px-2 py-1 transition-colors ${!isArithmetic ? 'bg-emerald-500 text-white font-medium' : 'text-gray-400 hover:bg-gray-100'}`}>
            ƒ נוסחה
          </button>
        </div>
        <button type="button" onClick={onRemove} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {isArithmetic ? (
          /* ── Arithmetic mode ── */
          <>
            {/* Input variable */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">משתנה קלט</label>
              <VarPicker
                value={step.inputVar || ''}
                onChange={v => updateArith('inputVar', v)}
                placeholder="בחר משתנה מספרי..."
              />
            </div>

            {/* Operator + operand inline */}
            <div className="flex items-end gap-2">
              {/* Operator buttons */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">פעולה</label>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {OPERATORS.map(o => (
                    <button key={o.id} type="button" onClick={() => updateArith('operator', o.id)}
                      title={o.label}
                      className={`w-9 h-9 flex items-center justify-center text-sm font-bold transition-colors ${op === o.id ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                      {o.symbol}
                    </button>
                  ))}
                </div>
              </div>

              {/* Operand: free text (number or {{var}}) */}
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-500 mb-1">ערך / משתנה</label>
                <input
                  type="text"
                  value={step.operand !== undefined ? step.operand : '1'}
                  onChange={e => updateArith('operand', e.target.value)}
                  placeholder="1  או  {{var}}"
                  dir="ltr"
                  className="w-full px-3 py-2 text-sm font-mono bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center gap-2 text-gray-300">
              <div className="flex-1 border-t border-dashed border-gray-200" />
              <span className="text-[11px] text-gray-400 font-medium">תוצאה</span>
              <div className="flex-1 border-t border-dashed border-gray-200" />
            </div>

            {/* Output variable */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">שמור תוצאה ב</label>
              <VarPicker
                value={step.outputVar || ''}
                onChange={v => updateArith('outputVar', v)}
                placeholder="בחר או צור משתנה..."
              />
              {step.inputVar && step.outputVar && step.outputVar === step.inputVar && (
                <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3" /> הערך של <code className="bg-emerald-50 px-1 rounded font-mono">{`{{${step.inputVar}}}`}</code> יתעדכן
                </p>
              )}
            </div>

            {/* Expression preview */}
            {step.expression && (
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
                <span className="text-[10px] text-gray-400 shrink-0">תצוגה:</span>
                <code className="text-xs text-gray-600 font-mono truncate" dir="ltr">{step.expression}</code>
              </div>
            )}
          </>
        ) : (
          /* ── Expression mode ── */
          <>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">נוסחה / ביטוי</label>
              <textarea
                value={step.expression || ''}
                onChange={e => onUpdate({ ...step, expression: e.target.value })}
                placeholder={'{{price}} * 1.17\nUPPER({{firstName}})'}
                rows={3}
                dir="ltr"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            {/* Arrow */}
            <div className="flex items-center gap-2 text-gray-300">
              <div className="flex-1 border-t border-dashed border-gray-200" />
              <span className="text-[11px] text-gray-400 font-medium">תוצאה</span>
              <div className="flex-1 border-t border-dashed border-gray-200" />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">שמור תוצאה ב</label>
              <VarPicker
                value={step.outputVar || ''}
                onChange={v => onUpdate({ ...step, outputVar: v })}
                placeholder="בחר או צור משתנה..."
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── FormulaEditor ────────────────────────────────────────────────────────────

export default function FormulaEditor({ data, onUpdate }) {
  const steps = data.steps || [];
  const [showHelp, setShowHelp] = useState(false);

  const addStep = (mode) => {
    onUpdate({
      steps: [
        ...steps,
        mode === 'arithmetic'
          ? { mode: 'arithmetic', inputVar: '', operator: '+', operand: '1', outputVar: '', expression: '' }
          : { mode: 'expression', outputVar: '', expression: '' },
      ],
    });
  };

  const removeStep = (i) => onUpdate({ steps: steps.filter((_, idx) => idx !== i) });

  const updateStep = (i, newStep) => {
    const next = [...steps];
    next[i] = newStep;
    onUpdate({ steps: next });
  };

  const switchMode = (i, mode) => {
    const step = { ...steps[i], mode };
    if (mode === 'arithmetic') {
      step.operator = step.operator || '+';
      step.operand = step.operand !== undefined ? step.operand : '1';
      step.expression = buildArithmeticExpression(step.inputVar || '', step.operator, step.operand);
    }
    updateStep(i, step);
  };

  return (
    <div className="space-y-4">
      {/* Empty state */}
      {steps.length === 0 && (
        <div className="text-center py-8 px-4 bg-gradient-to-b from-emerald-50/50 to-white rounded-2xl border-2 border-dashed border-emerald-200">
          <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Calculator className="w-7 h-7 text-emerald-600" />
          </div>
          <p className="text-gray-700 font-medium mb-1">אין שלבי חישוב עדיין</p>
          <p className="text-sm text-gray-500">הוסף שלב מהאפשרויות למטה</p>
        </div>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <div className="space-y-3">
          {steps.map((step, i) => (
            <StepCard
              key={i}
              step={step}
              index={i}
              onUpdate={(s) => updateStep(i, s)}
              onRemove={() => removeStep(i)}
              onSwitchMode={(mode) => switchMode(i, mode)}
            />
          ))}
        </div>
      )}

      {/* Add buttons */}
      <div className={`${steps.length > 0 ? 'border-t border-gray-100 pt-4' : ''}`}>
        <p className="text-xs font-medium text-gray-500 mb-2">הוסף שלב חישוב</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => addStep('arithmetic')}
            className="flex items-center gap-2 p-2.5 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all text-sm border border-emerald-200 hover:shadow-sm">
            <span className="text-base">⚡</span>
            <span className="text-[11px] font-medium text-emerald-700">חישוב מהיר</span>
          </button>
          <button onClick={() => addStep('expression')}
            className="flex items-center gap-2 p-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all text-sm border border-gray-200 hover:shadow-sm">
            <span className="text-base">ƒ</span>
            <span className="text-[11px] font-medium text-gray-600">נוסחה חופשית</span>
          </button>
        </div>
      </div>

      {/* Functions reference */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button onClick={() => setShowHelp(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors">
          <span>פונקציות זמינות</span>
          {showHelp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showHelp && (
          <div className="divide-y divide-gray-100">
            {FUNCTIONS_HELP.map(({ fn, desc }) => (
              <div key={fn} className="flex items-center gap-3 px-4 py-2">
                <code className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">{fn}</code>
                <span className="text-xs text-gray-500">{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
