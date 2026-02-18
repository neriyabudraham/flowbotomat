import useAuthStore from '../../store/authStore';

export default function ViewingAsBanner() {
  const { user } = useAuthStore();
  
  // Check if viewing as another user
  const token = localStorage.getItem('accessToken');
  let viewingAs = null;
  
  try {
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.viewingAs) {
        viewingAs = {
          originalUserId: payload.viewingAs,
          accessType: payload.accessType
        };
      }
    }
  } catch (e) {}

  if (!viewingAs) return null;

  const handleReturn = () => {
    const originalToken = localStorage.getItem('originalAccessToken');
    if (originalToken) {
      localStorage.setItem('accessToken', originalToken);
      localStorage.removeItem('originalAccessToken');
      window.location.reload();
    }
  };

  return (
    <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white py-2 px-4 text-center text-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
        <span>אתה צופה בחשבון של {user?.name || user?.email}</span>
        <button
          onClick={handleReturn}
          className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg font-medium transition-colors"
        >
          חזור לחשבון שלי
        </button>
      </div>
    </div>
  );
}
