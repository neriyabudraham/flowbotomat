const noteColors = [
  { id: 'yellow', label: 'צהוב', color: 'bg-yellow-200' },
  { id: 'blue', label: 'כחול', color: 'bg-blue-200' },
  { id: 'green', label: 'ירוק', color: 'bg-green-200' },
  { id: 'pink', label: 'ורוד', color: 'bg-pink-200' },
  { id: 'purple', label: 'סגול', color: 'bg-purple-200' },
];

export default function NoteEditor({ data, onUpdate }) {
  const selectedColor = data.color || 'yellow';
  
  return (
    <div className="space-y-4">
      {/* Color Picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">צבע ההערה</label>
        <div className="flex gap-2">
          {noteColors.map(({ id, label, color }) => (
            <button
              key={id}
              onClick={() => onUpdate({ color: id })}
              className={`w-8 h-8 rounded-full ${color} border-2 transition-all ${
                selectedColor === id ? 'border-gray-600 scale-110' : 'border-transparent hover:scale-105'
              }`}
              title={label}
            />
          ))}
        </div>
      </div>
      
      {/* Note Content */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">תוכן ההערה</label>
        <textarea
          value={data.note || ''}
          onChange={(e) => onUpdate({ note: e.target.value })}
          placeholder="כתוב כאן הערות, תזכורות או הסברים..."
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-yellow-200 focus:border-yellow-400 outline-none resize-none"
          rows={6}
        />
        <p className="text-xs text-gray-400 mt-1">ההערה מיועדת לתיעוד פנימי בלבד ולא תשפיע על פעולת הבוט</p>
      </div>
    </div>
  );
}
