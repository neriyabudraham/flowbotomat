import { useState, useEffect } from 'react';
import { X, Send, Bot, User, RotateCcw } from 'lucide-react';

export default function FlowPreview({ flowData, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState(true);

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
      if (action.type === 'text' && action.content) {
        const text = replaceVariables(action.content, userMessage);
        setMessages(prev => [...prev, { type: 'bot', content: text }]);
        await new Promise(r => setTimeout(r, 500));
      } else if (action.type === 'image' && action.url) {
        setMessages(prev => [...prev, { type: 'bot', content: '📷 [תמונה]', image: action.url }]);
        await new Promise(r => setTimeout(r, 500));
      } else if (action.type === 'delay') {
        const ms = (action.delay || 1) * (action.unit === 'minutes' ? 60000 : 1000);
        setMessages(prev => [...prev, { type: 'system', content: `⏱️ המתנה ${action.delay} ${action.unit === 'minutes' ? 'דקות' : 'שניות'}...` }]);
        await new Promise(r => setTimeout(r, Math.min(ms, 2000))); // Max 2s in preview
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
    const { title, body, buttons } = node.data;
    let text = `📋 *${title || 'רשימה'}*\n${body || ''}`;
    if (buttons?.length) {
      text += '\n\n';
      buttons.forEach((btn, i) => {
        text += `${i + 1}. ${btn.title}\n`;
      });
    }
    setMessages(prev => [...prev, { type: 'bot', content: text }]);
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md h-[600px] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-purple-500 to-purple-600 text-white">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6" />
            <span className="font-bold">תצוגה מקדימה</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="p-2 hover:bg-white/20 rounded-lg" title="התחל מחדש">
              <RotateCcw className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              <Bot className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>שלח הודעה כדי לבדוק את הפלואו</p>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.type === 'user' ? 'justify-start' : msg.type === 'bot' ? 'justify-end' : 'justify-center'}`}>
              {msg.type === 'system' ? (
                <div className="text-xs text-gray-500 bg-gray-200 px-3 py-1 rounded-full">{msg.content}</div>
              ) : (
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  msg.type === 'user' 
                    ? 'bg-white border border-gray-200 rounded-tr-none' 
                    : 'bg-purple-500 text-white rounded-tl-none'
                }`}>
                  {msg.image && (
                    <img src={msg.image} alt="" className="rounded-lg mb-2 max-h-40 object-cover" onError={(e) => e.target.style.display = 'none'} />
                  )}
                  <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
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
        </div>
        
        {/* Input */}
        <div className="p-4 bg-white border-t border-gray-200">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="הקלד הודעה..."
              className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-200 outline-none"
              disabled={isRunning}
            />
            <button
              onClick={handleSend}
              disabled={isRunning || !inputText.trim()}
              className="p-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
