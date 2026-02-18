import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings } from 'lucide-react';
import Logo from '../atoms/Logo';
import NotificationsDropdown from '../notifications/NotificationsDropdown';
import AccountSwitcher from '../AccountSwitcher';
import useAuthStore from '../../store/authStore';

export default function AppHeader({ 
  showBack = false, 
  backTo = '/dashboard',
  showSettings = false,
  onSettingsClick,
  rightContent,
  centerContent,
}) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left side - Logo and back button */}
          <div className="flex items-center gap-3">
            {showBack && (
              <>
                <button 
                  onClick={() => navigate(backTo)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="h-8 w-px bg-gray-200" />
              </>
            )}
            <Logo />
          </div>
          
          {/* Center content (optional) */}
          {centerContent && (
            <div className="hidden md:block">
              {centerContent}
            </div>
          )}
          
          {/* Right side - Actions */}
          <div className="flex items-center gap-2 md:gap-3">
            {rightContent}
            
            {showSettings && onSettingsClick && (
              <button 
                onClick={onSettingsClick}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                title="הגדרות"
              >
                <Settings className="w-5 h-5 text-gray-600" />
              </button>
            )}
            
            <NotificationsDropdown />
            
            <div className="hidden md:block h-8 w-px bg-gray-200" />
            
            <AccountSwitcher />
            
            <button 
              onClick={handleLogout}
              className="hidden md:block px-3 py-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all text-sm"
            >
              התנתק
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
