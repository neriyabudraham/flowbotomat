import { useState, useRef, useEffect } from 'react';
import { Plus, X, GripVertical, MessageSquare, Image, FileText, Video, Upload, Mic, User, MapPin, Link, Phone, Users, ChevronDown } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import api from '../../../../services/api';

const LIMITS = { text: 4096, caption: 1024 };

// Content types for sending to other recipient
const contentTypes = [
  { id: 'text', label: 'טקסט', icon: MessageSquare, color: 'teal' },
  { id: 'image', label: 'תמונה', icon: Image, color: 'blue' },
  { id: 'video', label: 'סרטון', icon: Video, color: 'purple' },
  { id: 'audio', label: 'הודעה קולית', icon: Mic, color: 'pink' },
  { id: 'file', label: 'קובץ', icon: FileText, color: 'gray' },
  { id: 'contact', label: 'איש קשר', icon: User, color: 'indigo' },
  { id: 'location', label: 'מיקום', icon: MapPin, color: 'red' },
];

export default function SendOtherEditor({ data, onUpdate }) {
  const actions = data.actions || [];
  const recipient = data.recipient || { type: 'phone', phone: '', useVariable: false, variableName: '' };
  const [dragIndex, setDragIndex] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Load groups when selecting group type
  useEffect(() => {
    if (recipient.type === 'group' && groups.length === 0) {
      loadGroups();
    }
  }, [recipient.type]);

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const { data } = await api.get('/whatsapp/groups');
      setGroups(data.groups || []);
    } catch (err) {
      console.error('Failed to load groups:', err);
    } finally {
      setLoadingGroups(false);
    }
  };

  const updateRecipient = (updates) => {
    onUpdate({ recipient: { ...recipient, ...updates } });
  };

  const addAction = (type) => {
    let newAction;
    switch (type) {
      case 'text':
        newAction = { type, content: '', enableLinkPreview: false };
        break;
      case 'image':
      case 'video':
        newAction = { type, url: '', caption: '', inputMode: 'upload' };
        break;
      case 'audio':
        newAction = { type, url: '', inputMode: 'upload' };
        break;
      case 'file':
        newAction = { type, url: '', filename: '', inputMode: 'upload' };
        break;
      case 'contact':
        newAction = { type, contactName: '', contactPhone: '', contactOrg: '' };
        break;
      case 'location':
        newAction = { type, latitude: '', longitude: '', locationTitle: '' };
        break;
      default:
        newAction = { type };
    }
    onUpdate({ actions: [...actions, newAction] });
  };

  const removeAction = (index) => {
    onUpdate({ actions: actions.filter((_, i) => i !== index) });
  };

  const updateAction = (index, updates) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    onUpdate({ actions: newActions });
  };

  const handleDragStart = (index) => setDragIndex(index);
  
  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newActions = [...actions];
    const [removed] = newActions.splice(dragIndex, 1);
    newActions.splice(index, 0, removed);
    onUpdate({ actions: newActions });
    setDragIndex(index);
  };

  return (
    <div className="space-y-4">
      {/* Recipient Selection */}
      <div className="bg-violet-50 rounded-xl p-4 border border-violet-200">
        <h4 className="font-medium text-violet-800 mb-3 flex items-center gap-2">
          <Phone className="w-4 h-4" />
          נמען
        </h4>
        
        {/* Type Selection */}
        <div className="flex bg-white rounded-lg p-1 mb-3 border border-violet-100">
          <button
            type="button"
            onClick={() => updateRecipient({ type: 'phone' })}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              recipient.type === 'phone'
                ? 'bg-violet-500 text-white shadow'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <Phone className="w-4 h-4" />
            מספר טלפון
          </button>
          <button
            type="button"
            onClick={() => updateRecipient({ type: 'group' })}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              recipient.type === 'group'
                ? 'bg-violet-500 text-white shadow'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <Users className="w-4 h-4" />
            קבוצה
          </button>
        </div>

        {/* Phone Input */}
        {recipient.type === 'phone' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
              <input
                type="checkbox"
                checked={recipient.useVariable || false}
                onChange={(e) => updateRecipient({ useVariable: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              השתמש במשתנה
            </label>
            
            {recipient.useVariable ? (
              <TextInputWithVariables
                value={recipient.variableName || ''}
                onChange={(v) => updateRecipient({ variableName: v })}
                placeholder="שם המשתנה (לדוגמה: phone)"
              />
            ) : (
              <TextInputWithVariables
                value={recipient.phone || ''}
                onChange={(v) => updateRecipient({ phone: v })}
                placeholder="מספר טלפון (למשל: 0584254229)"
              />
            )}
            <p className="text-xs text-gray-500">
              ניתן להזין בכל פורמט: 0584254229, 058-425-4229, 972584254229, +972584254229
            </p>
          </div>
        )}

        {/* Group Input */}
        {recipient.type === 'group' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
              <input
                type="checkbox"
                checked={recipient.useVariable || false}
                onChange={(e) => updateRecipient({ useVariable: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              השתמש במשתנה
            </label>
            
            {recipient.useVariable ? (
              <TextInputWithVariables
                value={recipient.variableName || ''}
                onChange={(v) => updateRecipient({ variableName: v })}
                placeholder="שם המשתנה (לדוגמה: group_id)"
              />
            ) : (
              <div className="space-y-2">
                {/* Group Selector */}
                <div className="relative">
                  <select
                    value={recipient.groupId || ''}
                    onChange={(e) => {
                      const selectedGroup = groups.find(g => g.id === e.target.value);
                      updateRecipient({ 
                        groupId: e.target.value, 
                        groupName: selectedGroup?.name || '' 
                      });
                    }}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm appearance-none pr-8"
                  >
                    <option value="">בחר קבוצה או הזן ידנית...</option>
                    {loadingGroups ? (
                      <option disabled>טוען קבוצות...</option>
                    ) : (
                      groups.map(group => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                
                {/* Manual Group ID Input */}
                <div className="text-center text-xs text-gray-400 py-1">או</div>
                <TextInputWithVariables
                  value={recipient.groupId || ''}
                  onChange={(v) => updateRecipient({ groupId: v, groupName: '' })}
                  placeholder="מזהה קבוצה (ניתן להזין עם או בלי @g.us)"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {actions.length > 0 ? (
        <div className="space-y-3">
          {actions.map((action, index) => (
            <div
              key={index}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={() => setDragIndex(null)}
              className={`transition-opacity ${dragIndex === index ? 'opacity-50' : ''}`}
            >
              <ActionItem
                action={action}
                index={index}
                canRemove={true}
                onUpdate={(updates) => updateAction(index, updates)}
                onRemove={() => removeAction(index)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 px-4 bg-gradient-to-b from-violet-50/50 to-white rounded-2xl border-2 border-dashed border-violet-200">
          <div className="w-14 h-14 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-7 h-7 text-violet-600" />
          </div>
          <p className="text-gray-700 font-medium mb-1">אין תוכן עדיין</p>
          <p className="text-sm text-gray-500">בחר סוג תוכן לשליחה</p>
        </div>
      )}

      {/* Add buttons */}
      <div className={actions.length > 0 ? "border-t border-gray-100 pt-4" : ""}>
        <p className="text-sm font-medium text-gray-700 mb-2">תוכן לשליחה</p>
        <div className="grid grid-cols-4 gap-2">
          {contentTypes.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => addAction(id)}
              className={`flex flex-col items-center gap-1 p-2.5 bg-${color}-50 hover:bg-${color}-100 text-${color}-700 rounded-xl transition-all text-sm border border-${color}-100 hover:border-${color}-200 hover:shadow-sm`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionItem({ action, index, canRemove, onUpdate, onRemove }) {
  const typeInfo = contentTypes.find(a => a.id === action.type) || { icon: MessageSquare, label: action.type, color: 'gray' };
  const Icon = typeInfo.icon;
  const fileInputRef = useRef(null);
  const [previewError, setPreviewError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadError('');
    setIsLoading(true);
    setUploadProgress(10);
    
    const maxSizeVideo = 20 * 1024 * 1024;
    const maxSizeImage = 10 * 1024 * 1024;
    const maxSizeFile = 25 * 1024 * 1024;
    
    const maxSize = action.type === 'video' ? maxSizeVideo 
                  : action.type === 'image' ? maxSizeImage 
                  : maxSizeFile;
    
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      setUploadError(`הקובץ גדול מדי. גודל מקסימלי: ${maxSizeMB}MB`);
      setIsLoading(false);
      return;
    }
    
    try {
      setUploadProgress(30);
      const objectUrl = URL.createObjectURL(file);
      setUploadProgress(50);
      
      const reader = new FileReader();
      reader.onload = () => {
        onUpdate({ 
          localFile: true, 
          fileName: file.name, 
          fileData: reader.result, 
          url: objectUrl,
          previewUrl: objectUrl,
          fileSize: file.size
        });
        setPreviewError(false);
        setIsLoading(false);
        setUploadProgress(100);
      };
      
      reader.onerror = () => {
        setUploadError('שגיאה בקריאת הקובץ');
        setIsLoading(false);
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      setUploadError(error.message || 'שגיאה בהעלאת הקובץ');
      setIsLoading(false);
    }
  };

  const previewUrl = action.previewUrl || action.url;

  return (
    <div className={`bg-${typeInfo.color}-50 rounded-xl p-3 border border-${typeInfo.color}-100`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
          <GripVertical className="w-4 h-4" />
        </div>
        <Icon className={`w-4 h-4 text-${typeInfo.color}-600`} />
        <span className={`text-sm font-medium text-${typeInfo.color}-700 flex-1`}>
          {typeInfo.label}
        </span>
        {canRemove && (
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {action.type === 'text' && (
        <div className="space-y-3">
          <TextInputWithVariables
            value={action.content || ''}
            onChange={(v) => onUpdate({ content: v })}
            placeholder="כתוב את ההודעה..."
            maxLength={LIMITS.text}
            multiline
            rows={3}
            label="תוכן ההודעה"
          />
          
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 hover:text-gray-700">
            <input
              type="checkbox"
              checked={action.enableLinkPreview || false}
              onChange={(e) => onUpdate({ enableLinkPreview: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            <span>תצוגה מקדימה של קישור</span>
          </label>
        </div>
      )}

      {(action.type === 'image' || action.type === 'video') && (
        <div className="space-y-3">
          {uploadError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
              <X className="w-4 h-4 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
          
          {isLoading && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-gray-600">מעלה...</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}
          
          {previewUrl && !previewError && !isLoading && (
            <div className="relative rounded-xl overflow-hidden bg-gray-100 shadow-lg">
              {action.type === 'image' ? (
                <img 
                  src={previewUrl} 
                  alt="תצוגה מקדימה" 
                  className="w-full max-h-64 object-contain bg-black/5"
                  onError={() => setPreviewError(true)}
                />
              ) : (
                <video 
                  src={previewUrl} 
                  className="w-full max-h-64"
                  controls
                  onError={() => setPreviewError(true)}
                />
              )}
              <button
                onClick={() => { onUpdate({ url: '', previewUrl: '', localFile: false, fileName: '' }); setPreviewError(false); setUploadError(''); }}
                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {!previewUrl && !isLoading && (
            <>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => onUpdate({ inputMode: 'upload' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    (action.inputMode || 'upload') === 'upload' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  העלאה
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ inputMode: 'url' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    action.inputMode === 'url' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
                  }`}
                >
                  <Link className="w-4 h-4" />
                  קישור
                </button>
              </div>
              
              {(action.inputMode || 'upload') === 'upload' && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-6 bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-violet-300 hover:bg-violet-50 transition-colors"
                  >
                    <Upload className="w-6 h-6 text-gray-400" />
                    <span className="text-sm text-gray-600">לחץ להעלאת {action.type === 'image' ? 'תמונה' : 'סרטון'}</span>
                  </button>
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    accept={action.type === 'image' ? 'image/*' : 'video/*'} 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                </>
              )}
              
              {action.inputMode === 'url' && (
                <TextInputWithVariables
                  value={action.url || ''}
                  onChange={(v) => onUpdate({ url: v })}
                  placeholder="הזן URL או {{משתנה}}"
                  dir="ltr"
                />
              )}
            </>
          )}
          
          {(action.type === 'image' || action.type === 'video') && (
            <TextInputWithVariables
              value={action.caption || ''}
              onChange={(v) => onUpdate({ caption: v })}
              placeholder="כיתוב (אופציונלי)"
              maxLength={LIMITS.caption}
            />
          )}
        </div>
      )}

      {action.type === 'audio' && (
        <div className="space-y-3">
          {!action.url && !isLoading && (
            <>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => onUpdate({ inputMode: 'upload' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    (action.inputMode || 'upload') === 'upload' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  העלאה
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ inputMode: 'url' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    action.inputMode === 'url' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
                  }`}
                >
                  <Link className="w-4 h-4" />
                  קישור
                </button>
              </div>
              
              {(action.inputMode || 'upload') === 'upload' && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-6 bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-violet-300 hover:bg-violet-50 transition-colors"
                  >
                    <Upload className="w-6 h-6 text-gray-400" />
                    <span className="text-sm text-gray-600">לחץ להעלאת קובץ שמע</span>
                  </button>
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    accept="audio/*" 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                </>
              )}
              
              {action.inputMode === 'url' && (
                <TextInputWithVariables
                  value={action.url || ''}
                  onChange={(v) => onUpdate({ url: v })}
                  placeholder="הזן URL או {{משתנה}}"
                  dir="ltr"
                />
              )}
            </>
          )}
          
          {action.url && (
            <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200">
              <Mic className="w-5 h-5 text-pink-500" />
              <span className="text-sm text-gray-600 flex-1 truncate">{action.fileName || 'קובץ שמע'}</span>
              <button
                onClick={() => onUpdate({ url: '', fileName: '' })}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {action.type === 'file' && (
        <div className="space-y-3">
          {!action.url && !isLoading && (
            <>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => onUpdate({ inputMode: 'upload' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    (action.inputMode || 'upload') === 'upload' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  העלאה
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ inputMode: 'url' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    action.inputMode === 'url' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
                  }`}
                >
                  <Link className="w-4 h-4" />
                  קישור
                </button>
              </div>
              
              {(action.inputMode || 'upload') === 'upload' && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-6 bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-violet-300 hover:bg-violet-50 transition-colors"
                  >
                    <Upload className="w-6 h-6 text-gray-400" />
                    <span className="text-sm text-gray-600">לחץ להעלאת קובץ</span>
                  </button>
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                </>
              )}
              
              {action.inputMode === 'url' && (
                <TextInputWithVariables
                  value={action.url || ''}
                  onChange={(v) => onUpdate({ url: v })}
                  placeholder="הזן URL או {{משתנה}}"
                  dir="ltr"
                />
              )}
            </>
          )}
          
          {action.url && (
            <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200">
              <FileText className="w-5 h-5 text-gray-500" />
              <span className="text-sm text-gray-600 flex-1 truncate">{action.fileName || action.filename || 'קובץ'}</span>
              <button
                onClick={() => onUpdate({ url: '', fileName: '', filename: '' })}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          <TextInputWithVariables
            value={action.filename || ''}
            onChange={(v) => onUpdate({ filename: v })}
            placeholder="שם הקובץ (כולל סיומת)"
          />
        </div>
      )}

      {action.type === 'contact' && (
        <div className="space-y-3">
          <TextInputWithVariables
            value={action.contactName || ''}
            onChange={(v) => onUpdate({ contactName: v })}
            placeholder="שם איש הקשר"
            label="שם"
          />
          <TextInputWithVariables
            value={action.contactPhone || ''}
            onChange={(v) => onUpdate({ contactPhone: v })}
            placeholder="מספר טלפון"
            label="טלפון"
          />
          <TextInputWithVariables
            value={action.contactOrg || ''}
            onChange={(v) => onUpdate({ contactOrg: v })}
            placeholder="חברה/ארגון (אופציונלי)"
            label="חברה"
          />
        </div>
      )}

      {action.type === 'location' && (
        <div className="space-y-3">
          <TextInputWithVariables
            value={action.latitude || ''}
            onChange={(v) => onUpdate({ latitude: v })}
            placeholder="קו רוחב (Latitude)"
            label="קו רוחב"
          />
          <TextInputWithVariables
            value={action.longitude || ''}
            onChange={(v) => onUpdate({ longitude: v })}
            placeholder="קו אורך (Longitude)"
            label="קו אורך"
          />
          <TextInputWithVariables
            value={action.locationTitle || ''}
            onChange={(v) => onUpdate({ locationTitle: v })}
            placeholder="שם המיקום (אופציונלי)"
            label="שם המיקום"
          />
        </div>
      )}
    </div>
  );
}
