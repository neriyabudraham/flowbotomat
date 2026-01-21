import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Pages - will be implemented
// import LoginPage from './pages/auth/LoginPage';
// import DashboardPage from './pages/DashboardPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Routes>
          <Route path="/" element={<HomePage />} />
          {/* Future routes */}
          {/* <Route path="/login" element={<LoginPage />} /> */}
          {/* <Route path="/dashboard" element={<DashboardPage />} /> */}
        </Routes>
      </div>
    </BrowserRouter>
  );
}

// Temporary Home Page
function HomePage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary-600 mb-4">
          FlowBotomat
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          🚀 המערכת בבנייה...
        </p>
        <p className="text-sm text-gray-400 mt-8">
          v1.0.0
        </p>
      </div>
    </div>
  );
}

export default App;
