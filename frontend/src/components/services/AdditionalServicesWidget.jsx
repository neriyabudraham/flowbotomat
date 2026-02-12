import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronLeft, Sparkles, Check, ExternalLink } from 'lucide-react';
import api from '../../services/api';

const SERVICE_ICONS = {
  'webhook': '🔗',
  'forms': '📝',
  'crm': '👥',
  'analytics': '📊',
  'sms': '📱',
  'email': '📧',
  'ai': '🤖',
  'default': '⚡',
};

export default function AdditionalServicesWidget() {
  const [services, setServices] = useState([]);
  const [myServices, setMyServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [servicesRes, myServicesRes] = await Promise.all([
        api.get('/services'),
        api.get('/services/my'),
      ]);
      setServices(servicesRes.data.services || []);
      setMyServices(myServicesRes.data.subscriptions || []);
    } catch (err) {
      console.error('Failed to load services:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get active service IDs
  const activeServiceIds = new Set(myServices.map(s => s.service_id));

  // Filter to show: active services first, then available ones (limit to 3)
  const displayServices = [
    ...services.filter(s => activeServiceIds.has(s.id)),
    ...services.filter(s => !activeServiceIds.has(s.id) && !s.is_coming_soon),
  ].slice(0, 3);

  // Show coming soon if there's room
  const comingSoon = services.filter(s => s.is_coming_soon).slice(0, 1);

  if (loading) return null;
  if (services.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-cyan-50 flex items-center justify-between">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Package className="w-5 h-5 text-teal-600" />
          שירותים נוספים
        </h3>
        <Link 
          to="/services" 
          className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
        >
          כל השירותים
          <ChevronLeft className="w-4 h-4" />
        </Link>
      </div>
      
      <div className="p-4">
        <div className="grid md:grid-cols-3 gap-4">
          {displayServices.map(service => {
            const isActive = activeServiceIds.has(service.id);
            const subscription = myServices.find(s => s.service_id === service.id);
            const icon = SERVICE_ICONS[service.icon] || SERVICE_ICONS.default;
            
            return (
              <ServiceMiniCard
                key={service.id}
                service={service}
                icon={icon}
                isActive={isActive}
                subscription={subscription}
              />
            );
          })}
          
          {comingSoon.map(service => (
            <ComingSoonCard key={service.id} service={service} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ServiceMiniCard({ service, icon, isActive, subscription }) {
  return (
    <div className={`relative rounded-xl p-4 transition-all ${
      isActive 
        ? 'bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200' 
        : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
    }`}>
      {isActive && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
      
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
          service.color ? `bg-gradient-to-br ${service.color}` : 'bg-gradient-to-br from-teal-400 to-cyan-500'
        }`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-gray-800 truncate">{service.name_he}</h4>
          {isActive ? (
            <div className="flex items-center gap-1 text-sm text-green-600">
              <span>פעיל</span>
              {subscription?.is_trial && (
                <span className="text-xs text-blue-600">
                  (ניסיון)
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              ₪{service.price}/חודש
            </p>
          )}
        </div>
      </div>
      
      <div className="mt-3">
        {isActive ? (
          <a
            href={service.external_url || `/services/${service.slug}`}
            target={service.external_url ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-1 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
          >
            כניסה לשירות
            {service.external_url && <ExternalLink className="w-3 h-3" />}
          </a>
        ) : (
          <Link
            to={`/services#${service.slug}`}
            className="w-full flex items-center justify-center gap-1 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors"
          >
            פרטים נוספים
          </Link>
        )}
      </div>
    </div>
  );
}

function ComingSoonCard({ service }) {
  const icon = SERVICE_ICONS[service.icon] || SERVICE_ICONS.default;
  
  return (
    <div className="relative rounded-xl p-4 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
      <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full text-white text-xs font-bold flex items-center gap-1">
        <Sparkles className="w-3 h-3" />
        בקרוב
      </div>
      
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl opacity-70 ${
          service.color ? `bg-gradient-to-br ${service.color}` : 'bg-gradient-to-br from-purple-400 to-pink-500'
        }`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-gray-800 truncate">{service.name_he}</h4>
          <p className="text-sm text-purple-600">
            {service.description_he?.slice(0, 40) || 'בפיתוח...'}
          </p>
        </div>
      </div>
    </div>
  );
}
