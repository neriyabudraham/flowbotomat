import { useState, useEffect, useRef } from 'react';
import { X, Send, Bot, User, RotateCcw, ListOrdered, Image, Video, FileText, Clock, MapPin, Music } from 'lucide-react';

export default function FlowPreview({ flowData, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState(true);
  const [pendingListNode, setPendingListNode] = useState(null);
  const [lastUserMessage, setLastUserMessage] = useState('');
  const messagesEndRef = useRef(null);
  
  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset simulation
  const handleReset = () => {
    setMessages([]);
    setCurrentNodeId(null);
    setIsRunning(false);
    setWaitingForInput(true);
    setInputText('');
  };

  // Send message (simulate user)
  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    const userMessage = inputText.trim();
    setMessages(prev => [...prev, { type: 'user', content: userMessage }]);
    setInputText('');
    setWaitingForInput(false);
    setLastUserMessage(userMessage);
    
    // Find trigger node and check if matches
    const triggerNode = flowData.nodes.find(n => n.type === 'trigger');
    if (!triggerNode) {
      setMessages(prev => [...prev, { type: 'system', content: 'לא נמצא טריגר בפלואו' }]);
      setWaitingForInput(true);
      return;
    }
    
    const triggerMatches = checkTrigger(triggerNode.data, userMessage);
    if (!triggerMatches) {
      setMessages(prev => [...prev, { type: 'system', content: 'הטריגר לא תואם את ההודעה' }]);
      setWaitingForInput(true);
      return;
    }
    
    // Start flow execution
    setIsRunning(true);
    const nextEdge = flowData.edges.find(e => e.source === triggerNode.id);
    if (nextEdge) {
      await executeNode(nextEdge.target, userMessage);
    } else {
      setMessages(prev => [...prev, { type: 'system', content: 'אין המשך לטריגר' }]);
    }
    setIsRunning(false);
    setWaitingForInput(true);
  };
  
  // Handle list button click
  const handleListButtonClick = async (nodeId, buttonIndex, buttonTitle) => {
    setMessages(prev => [...prev, { type: 'user', content: buttonTitle }]);
    setPendingListNode(null);
    setWaitingForInput(false);
    setIsRunning(true);
    setLastUserMessage(buttonTitle);
    
    // Find the edge that matches this button index (handle ID is just the index as string)
    const edge = flowData.edges.find(e => 
      e.source === nodeId && e.sourceHandle === String(buttonIndex)
    );
    
    if (edge) {
      await executeNode(edge.target, buttonTitle);
    } else {
      setMessages(prev => [...prev, { type: 'system', content: `אין המשך מוגדר לכפתור "${buttonTitle}"` }]);
    }
    
    setIsRunning(false);
    setWaitingForInput(true);
  };

  // Execute a node
  const executeNode = async (nodeId, userMessage) => {
    const node = flowData.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    setCurrentNodeId(nodeId);
    
    let nextHandleId = null;
    
    switch (node.type) {
      case 'message':
        await executeMessageNode(node, userMessage);
        break;
      case 'condition':
        nextHandleId = executeConditionNode(node, userMessage);
        break;
      case 'delay':
        await executeDelayNode(node);
        break;
      case 'action':
        executeActionNode(node);
        break;
      case 'list':
        await executeListNode(node);
        return; // List waits for input
      case 'registration':
        nextHandleId = await executeRegistrationNode(node);
        break;
    }
    
    // Find next
    let nextEdge;
    if (nextHandleId) {
      nextEdge = flowData.edges.find(e => e.source === nodeId && e.sourceHandle === nextHandleId);
    } else {
      nextEdge = flowData.edges.find(e => e.source === nodeId && !e.sourceHandle);
    }
    
    if (nextEdge) {
      await new Promise(r => setTimeout(r, 300)); // Visual delay
      await executeNode(nextEdge.target, userMessage);
    }
    
    setCurrentNodeId(null);
  };

  // Execute message node
  const executeMessageNode = async (node, userMessage) => {
    const actions = node.data.actions || [];
    
    for (const action of actions) {
      switch (action.type) {
        case 'text':
          if (action.content) {
            const text = replaceVariables(action.content, userMessage);
            setMessages(prev => [...prev, { type: 'bot', content: text }]);
            await new Promise(r => setTimeout(r, 500));
          }
          break;
          
        case 'image':
          if (action.url || action.fileData) {
            const caption = action.caption ? replaceVariables(action.caption, userMessage) : '';
            setMessages(prev => [...prev, { 
              type: 'bot', 
              content: caption,
              media: { type: 'image', url: action.fileData || action.url }
            }]);
            await new Promise(r => setTimeout(r, 500));
          }
          break;
          
        case 'video':
          if (action.url || action.fileData) {
            const caption = action.caption ? replaceVariables(action.caption, userMessage) : '';
            setMessages(prev => [...prev, { 
              type: 'bot', 
              content: caption,
              media: { type: 'video', url: action.fileData || action.url }
            }]);
            await new Promise(r => setTimeout(r, 500));
          }
          break;
          
        case 'audio':
          if (action.url || action.fileData) {
            setMessages(prev => [...prev, { 
              type: 'bot', 
              content: '',
              media: { type: 'audio', url: action.fileData || action.url }
            }]);
            await new Promise(r => setTimeout(r, 500));
          }
          break;
          
        case 'file':
          if (action.url || action.fileData) {
            setMessages(prev => [...prev, { 
              type: 'bot', 
              content: action.filename || 'קובץ',
              media: { type: 'file', url: action.fileData || action.url, filename: action.filename }
            }]);
            await new Promise(r => setTimeout(r, 500));
          }
          break;
          
        case 'location':
          if (action.latitude && action.longitude) {
            setMessages(prev => [...prev, { 
              type: 'bot', 
              content: action.title || 'מיקום',
              media: { type: 'location', lat: action.latitude, lng: action.longitude, title: action.title }
            }]);
            await new Promise(r => setTimeout(r, 500));
          }
          break;
          
        case 'delay':
          const ms = (action.delay || 1) * (action.unit === 'minutes' ? 60000 : 1000);
          setMessages(prev => [...prev, { type: 'system', content: `⏱️ המתנה ${action.delay} ${action.unit === 'minutes' ? 'דקות' : 'שניות'}...` }]);
          await new Promise(r => setTimeout(r, Math.min(ms, 2000))); // Max 2s in preview
          break;
          
        default:
          console.log('[Preview] Unknown action type:', action.type);
      }
    }
  };

  // Execute condition node
  const executeConditionNode = (node, userMessage) => {
    const { variable, operator, value } = node.data;
    let checkValue = userMessage;
    
    const lowerCheck = (checkValue || '').toLowerCase();
    const lowerValue = (value || '').toLowerCase();
    
    let result = false;
    switch (operator) {
      case 'equals': result = lowerCheck === lowerValue; break;
      case 'not_equals': result = lowerCheck !== lowerValue; break;
      case 'contains': result = lowerCheck.includes(lowerValue); break;
      case 'not_contains': result = !lowerCheck.includes(lowerValue); break;
      case 'starts_with': result = lowerCheck.startsWith(lowerValue); break;
      case 'ends_with': result = lowerCheck.endsWith(lowerValue); break;
      case 'is_empty': result = checkValue.trim() === ''; break;
      case 'is_not_empty': result = checkValue.trim() !== ''; break;
      default: result = false;
    }
    
    setMessages(prev => [...prev, { type: 'system', content: `🔀 תנאי: ${result ? '✅ כן' : '❌ לא'}` }]);
    return result ? 'yes' : 'no';
  };

  // Execute delay node
  const executeDelayNode = async (node) => {
    const { delay, unit } = node.data;
    setMessages(prev => [...prev, { type: 'system', content: `⏱️ השהייה ${delay} ${unit === 'minutes' ? 'דקות' : 'שניות'}` }]);
    await new Promise(r => setTimeout(r, 1000)); // 1s in preview
  };

  // Execute action node
  const executeActionNode = (node) => {
    const actions = node.data.actions || [];
    for (const action of actions) {
      setMessages(prev => [...prev, { type: 'system', content: `⚙️ פעולה: ${action.type}` }]);
    }
  };

  // Execute list node
  const executeListNode = async (node) => {
    const { title, body, buttons, buttonText } = node.data;
    setPendingListNode(node.id);
    setMessages(prev => [...prev, { 
      type: 'bot', 
      content: body || '',
      list: {
        title: title || 'רשימה',
        buttonText: buttonText || 'בחר',
        buttons: buttons || [],
        nodeId: node.id
      }
    }]);
    setIsRunning(false);
    setWaitingForInput(true);
  };

  // Execute registration node
  const executeRegistrationNode = async (node) => {
    const { fields } = node.data;
    const fieldLabels = {
      full_name: 'שם מלא',
      email: 'אימייל',
      phone: 'טלפון',
      city: 'עיר',
      notes: 'הערות',
      custom: 'שדה מותאם'
    };
    
    const fieldsList = (fields || []).map(f => fieldLabels[f.type] || f.label || f.type).join(', ');
    setMessages(prev => [...prev, { 
      type: 'system', 
      content: `📋 טופס רישום: ${fieldsList || 'ללא שדות'}`
    }]);
    
    // Simulate successful registration
    await new Promise(r => setTimeout(r, 800));
    setMessages(prev => [...prev, { type: 'system', content: '✅ רישום הושלם (סימולציה)' }]);
    
    return 'complete'; // Return handle ID for next node
  };

  // Check trigger
  const checkTrigger = (triggerData, message) => {
    const triggers = triggerData.triggers || [{ type: 'any_message' }];
    for (const trigger of triggers) {
      let matches = false;
      switch (trigger.type) {
        case 'any_message': matches = true; break;
        case 'contains': matches = message.toLowerCase().includes((trigger.value || '').toLowerCase()); break;
        case 'starts_with': matches = message.toLowerCase().startsWith((trigger.value || '').toLowerCase()); break;
        case 'exact': matches = message.toLowerCase() === (trigger.value || '').toLowerCase(); break;
        default: matches = false;
      }
      if (trigger.not) matches = !matches;
      if (matches) return true;
    }
    return false;
  };

  // Replace variables
  const replaceVariables = (text, userMessage) => {
    return text
      .replace(/\{\{name\}\}/gi, 'משתמש לדוגמה')
      .replace(/\{\{phone\}\}/gi, '0501234567')
      .replace(/\{\{message\}\}/gi, userMessage)
      .replace(/\{\{date\}\}/gi, new Date().toLocaleDateString('he-IL'))
      .replace(/\{\{time\}\}/gi, new Date().toLocaleTimeString('he-IL'));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md h-[650px] shadow-2xl flex flex-col overflow-hidden border border-gray-200">
        {/* WhatsApp-style Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-emerald-500 to-teal-600">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div className="text-white">
              <span className="font-bold block">תצוגה מקדימה</span>
              <span className="text-xs text-white/70">סימולציית בוט</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={handleReset} 
              className="p-2 hover:bg-white/20 rounded-full transition-colors" 
              title="התחל מחדש"
            >
              <RotateCcw className="w-5 h-5 text-white" />
            </button>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
        
        {/* Messages - WhatsApp style background */}
        <div 
          className="flex-1 overflow-y-auto p-4 space-y-3"
          style={{
            backgroundColor: '#e5ddd5',
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d4ccc3\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
          }}
        >
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-white/80 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Bot className="w-10 h-10 text-teal-600" />
              </div>
              <h3 className="font-semibold text-gray-700 mb-2">בדוק את הבוט שלך</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                שלח הודעה כדי לראות איך הבוט יגיב בפועל
              </p>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.type === 'user' ? 'justify-start' : msg.type === 'bot' ? 'justify-end' : 'justify-center'}`}>
              {msg.type === 'system' ? (
                <div className="text-xs text-gray-600 bg-white/90 px-4 py-1.5 rounded-full shadow-sm backdrop-blur-sm">
                  {msg.content}
                </div>
              ) : (
                <div className={`max-w-[85%] rounded-lg overflow-hidden shadow-sm ${
                  msg.type === 'user' 
                    ? 'bg-white rounded-tr-none' 
                    : 'bg-emerald-500 text-white rounded-tl-none'
                }`}>
                  {/* Media content */}
                  {msg.media && (
                    <div className="border-b border-emerald-400/30">
                      {msg.media.type === 'image' && (
                        <img 
                          src={msg.media.url} 
                          alt="" 
                          className="max-h-48 w-full object-cover" 
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }} 
                        />
                      )}
                      {msg.media.type === 'video' && (
                        <div className="relative">
                          <video 
                            src={msg.media.url} 
                            controls 
                            className="max-h-48 w-full" 
                            onError={(e) => e.target.parentElement.innerHTML = '<div class="p-4 flex items-center gap-2"><span>🎬</span><span>וידאו</span></div>'}
                          />
                        </div>
                      )}
                      {msg.media.type === 'audio' && (
                        <div className="p-3 flex items-center gap-3">
                          <Music className="w-8 h-8 opacity-80" />
                          <audio src={msg.media.url} controls className="flex-1 h-8" />
                        </div>
                      )}
                      {msg.media.type === 'file' && (
                        <div className="p-3 flex items-center gap-3">
                          <FileText className="w-8 h-8 opacity-80" />
                          <span className="text-sm">{msg.media.filename || 'קובץ'}</span>
                        </div>
                      )}
                      {msg.media.type === 'location' && (
                        <a 
                          href={`https://maps.google.com/?q=${msg.media.lat},${msg.media.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 flex items-center gap-3 hover:opacity-80"
                        >
                          <MapPin className="w-8 h-8 opacity-80" />
                          <span className="text-sm">{msg.media.title || 'מיקום'}</span>
                        </a>
                      )}
                    </div>
                  )}
                  {/* Legacy image support */}
                  {msg.image && !msg.media && (
                    <img src={msg.image} alt="" className="max-h-40 object-cover w-full" onError={(e) => e.target.style.display = 'none'} />
                  )}
                  {msg.content && (
                    <div className="whitespace-pre-wrap text-sm px-4 py-2">{msg.content}</div>
                  )}
{/* List buttons */}
                          {msg.list && msg.list.buttons.length > 0 && (
                            <div className="border-t border-emerald-400/30 mt-1">
                              <div className="px-3 py-2 text-xs font-medium border-b border-emerald-400/30 flex items-center gap-2 bg-emerald-600/30">
                                <ListOrdered className="w-4 h-4" />
                                {msg.list.title}
                              </div>
                              <div className="bg-emerald-600/10">
                                {msg.list.buttons.map((btn, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleListButtonClick(msg.list.nodeId, idx, btn.title || `אפשרות ${idx + 1}`)}
                                    disabled={isRunning || pendingListNode !== msg.list.nodeId}
                                    className="w-full px-3 py-2.5 text-sm text-right hover:bg-emerald-400/30 transition-colors border-b border-emerald-400/20 last:border-b-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                  >
                                    <span className="w-5 h-5 rounded-full bg-emerald-400/30 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                      {idx + 1}
                                    </span>
                                    <div className="flex-1 text-right">
                                      <span className="font-medium">{btn.title || `אפשרות ${idx + 1}`}</span>
                                      {btn.description && <span className="block text-xs opacity-75 mt-0.5">{btn.description}</span>}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                </div>
              )}
            </div>
          ))}
          
          {isRunning && (
            <div className="flex justify-end">
              <div className="bg-purple-500 text-white rounded-2xl px-4 py-2 rounded-tl-none">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input - WhatsApp style */}
        <div className="p-3 bg-gray-100 border-t border-gray-200">
          <div className="flex gap-2 items-end">
            <div className="flex-1 bg-white rounded-full px-4 py-2 shadow-sm">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="הקלד הודעה..."
                className="w-full outline-none text-sm"
                dir="auto"
                disabled={isRunning}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={isRunning || !inputText.trim()}
              className="w-10 h-10 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md transition-all hover:scale-105"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-2">
            הקלד הודעה לבדיקת הבוט. התנהגות בפועל תלויה בהגדרות הבוט.
          </p>
        </div>
      </div>
    </div>
  );
}
