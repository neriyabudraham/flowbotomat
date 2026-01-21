import { Sun, Moon, Monitor } from 'lucide-react';
import useThemeStore from '../../store/themeStore';

export default function ThemeToggle({ showLabel = false, className = '' }) {
  const { theme, setTheme, toggleTheme } = useThemeStore();

  const themes = [
    { id: 'light', icon: Sun, label: 'בהיר' },
    { id: 'dark', icon: Moon, label: 'כהה' },
    { id: 'system', icon: Monitor, label: 'מערכת' },
  ];

  // Simple toggle button
  if (!showLabel) {
    return (
      <button
        onClick={toggleTheme}
        className={`p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${className}`}
        title={theme === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
      >
        {theme === 'dark' ? (
          <Sun className="w-5 h-5 text-yellow-500" />
        ) : (
          <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        )}
      </button>
    );
  }

  // Full selector
  return (
    <div className={`flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl ${className}`}>
      {themes.map((t) => {
        const Icon = t.icon;
        const isActive = theme === t.id;
        
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
              isActive
                ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
