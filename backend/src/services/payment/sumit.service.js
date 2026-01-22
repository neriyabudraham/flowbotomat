const axios = require('axios');

const SUMIT_BASE_URL = 'https://api.sumit.co.il';

/**
 * Get Sumit API credentials from environment
 */
function getCredentials() {
  return {
    CompanyID: parseInt(process.env.SUMIT_CompanyID) || 0,
    APIKey: process.env.SUMIT_APIKey || '',
    APIPublicKey: process.env.SUMIT_APIPublicKey || '',
  };
}

/**
 * Validate credentials are configured
 */
function validateCredentials(credentials) {
  if (!credentials.CompanyID || !credentials.APIKey) {
    throw new Error('Sumit credentials not configured. Check SUMIT_CompanyID and SUMIT_APIKey environment variables.');
  }
}

/**
 * Create a customer in Sumit
 * @param {object} params - Customer details
 * @returns {Promise<{success: boolean, customerId?: number, error?: string}>}
 */
async function createCustomer({ name, phone, email, citizenId, companyNumber, externalId }) {
  const credentials = getCredentials();
  
  try {
    validateCredentials(credentials);
    
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIKey: credentials.APIKey,
      },
      Details: {
        Name: name || 'לקוח',
        Phone: phone || null,
        EmailAddress: email || null,
        Personal_ID: citizenId || null,
        CompanyNumber: companyNumber || null,
        ExternalIdentifier: externalId || null,
        SearchMode: null,
        NoVAT: null,
        City: null,
        Address: null,
        ZipCode: null,
        Folder: null,
        Properties: null,
      },
      ResponseLanguage: 'he',
    };
    
    console.log('[Sumit] Creating customer:', name);
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/accounting/customers/create/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
        timeout: 30000,
      }
    );
    
    console.log('[Sumit] Create customer response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        customerId: response.data.Data?.CustomerID,
        customerHistoryURL: response.data.Data?.CustomerHistoryURL,
      };
    } else {
      return {
        success: false,
        error: response.data.UserErrorMessage || 'יצירת לקוח נכשלה',
        technicalError: response.data.TechnicalErrorDetails,
        status: response.data.Status,
      };
    }
  } catch (error) {
    console.error('[Sumit] Create customer error:', error.message);
    if (error.response) {
      console.error('[Sumit] Response status:', error.response.status);
      console.error('[Sumit] Response data:', error.response.data);
    }
    return {
      success: false,
      error: error.response?.data?.UserErrorMessage || 'שגיאה בתקשורת עם מערכת התשלומים',
    };
  }
}

/**
 * Set payment method for customer using SingleUseToken
 * This converts the short-term token from Sumit JS API to a permanent payment method
 * 
 * IMPORTANT: The SingleUseToken is valid for a very short time - call this immediately after getting it!
 * 
 * @param {object} params - Parameters
 * @param {number} params.customerId - Sumit customer ID (optional - will create new if not provided)
 * @param {string} params.singleUseToken - Short-term token from Sumit JS API
 * @param {object} params.customerInfo - Customer details for creation/lookup
 * @returns {Promise<{success: boolean, customerId?: number, paymentMethodId?: number, last4Digits?: string, error?: string}>}
 */
async function setPaymentMethodForCustomer({ customerId, singleUseToken, customerInfo }) {
  const credentials = getCredentials();
  
  try {
    validateCredentials(credentials);
    
    if (!singleUseToken) {
      return {
        success: false,
        error: 'נדרש טוקן אשראי. אנא נסה שנית.',
      };
    }
    
    // Build request body according to Sumit API spec
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIKey: credentials.APIKey,
      },
      // Customer - either existing ID or new customer details
      Customer: customerId ? {
        ID: customerId,
        SearchMode: 0, // Search by ID
      } : {
        Name: customerInfo?.name || 'לקוח',
        Phone: customerInfo?.phone || null,
        EmailAddress: customerInfo?.email || null,
        CompanyNumber: customerInfo?.companyNumber || null,
        ExternalIdentifier: customerInfo?.externalId || null,
        SearchMode: 0, // Automatic
      },
      // Use SingleUseToken - the card data comes from the token
      SingleUseToken: singleUseToken,
      PaymentMethod: null, // Will be set from token
    };
    
    console.log('[Sumit] Setting payment method for customer:', customerId || 'new customer');
    console.log('[Sumit] Token (first 20 chars):', singleUseToken?.substring(0, 20) + '...');
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/paymentmethods/setforcustomer/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
        timeout: 30000,
      }
    );
    
    console.log('[Sumit] Set payment method response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        customerId: response.data.Data?.CustomerID || customerId,
        paymentMethodId: response.data.Data?.PaymentMethodID,
        last4Digits: response.data.Data?.Last4Digits || response.data.Data?.CreditCard_LastDigits,
        cardBrand: response.data.Data?.CardBrand,
        expiryMonth: response.data.Data?.CreditCard_ExpirationMonth,
        expiryYear: response.data.Data?.CreditCard_ExpirationYear,
        data: response.data.Data,
      };
    } else {
      // Parse specific error codes
      let userError = response.data.UserErrorMessage || 'שמירת כרטיס אשראי נכשלה';
      
      // Common errors
      if (response.data.TechnicalErrorDetails?.includes('Token') || 
          response.data.TechnicalErrorDetails?.includes('expired')) {
        userError = 'פג תוקף הטוקן. אנא נסה שנית.';
      }
      
      return {
        success: false,
        error: userError,
        technicalError: response.data.TechnicalErrorDetails,
        status: response.data.Status,
      };
    }
  } catch (error) {
    console.error('[Sumit] Set payment method error:', error.message);
    if (error.response) {
      console.error('[Sumit] Response status:', error.response.status);
      console.error('[Sumit] Response data:', error.response.data);
    }
    
    let userError = 'שגיאה בשמירת כרטיס האשראי';
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      userError = 'תם הזמן לחיבור. אנא נסה שנית.';
    }
    
    return {
      success: false,
      error: userError,
    };
  }
}

/**
 * Charge a customer using their saved payment method
 * This is for one-time charges (yearly subscriptions, manual charges)
 * 
 * @param {object} params
 * @param {number} params.customerId - Sumit customer ID
 * @param {number} params.amount - Amount to charge (including VAT)
 * @param {string} params.description - Description for the charge
 * @param {boolean} params.sendEmail - Whether to send receipt by email
 * @returns {Promise<{success: boolean, transactionId?: string, documentNumber?: string, error?: string}>}
 */
async function chargeOneTime({ customerId, amount, description, sendEmail = true }) {
  const credentials = getCredentials();
  
  try {
    validateCredentials(credentials);
    
    if (!customerId) {
      return { success: false, error: 'נדרש מזהה לקוח' };
    }
    
    if (!amount || amount <= 0) {
      return { success: false, error: 'סכום לא תקין' };
    }
    
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIKey: credentials.APIKey,
      },
      Customer: {
        ID: customerId,
        SearchMode: 0, // Search by ID
      },
      // Use customer's saved payment method (Type: 0)
      PaymentMethod: {
        Type: 0, // Use customer's default saved payment method
      },
      Items: [{
        Item: {
          Name: description || 'תשלום',
        },
        Quantity: 1,
        UnitPrice: amount,
        Currency: 'ILS',
      }],
      VATIncluded: true,
      SendDocumentByEmail: sendEmail,
      SendDocumentByEmail_Language: 'he',
      DocumentLanguage: 'he',
      ResponseLanguage: 'he',
    };
    
    console.log('[Sumit] Charging one-time - Customer:', customerId, 'Amount:', amount, 'ILS');
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/payments/charge/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
        timeout: 60000, // 60 seconds for payment
      }
    );
    
    console.log('[Sumit] Charge one-time response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        transactionId: response.data.Data?.TransactionID,
        documentNumber: response.data.Data?.DocumentNumber,
        documentURL: response.data.Data?.DocumentURL,
        data: response.data.Data,
      };
    } else {
      let userError = response.data.UserErrorMessage || 'החיוב נכשל';
      
      // Parse common errors
      if (response.data.TechnicalErrorDetails?.includes('declined')) {
        userError = 'הכרטיס נדחה. אנא בדוק את פרטי הכרטיס.';
      } else if (response.data.TechnicalErrorDetails?.includes('expired')) {
        userError = 'פג תוקף הכרטיס. אנא עדכן את פרטי התשלום.';
      } else if (response.data.TechnicalErrorDetails?.includes('insufficient')) {
        userError = 'אין מספיק אשראי בכרטיס.';
      }
      
      return {
        success: false,
        error: userError,
        technicalError: response.data.TechnicalErrorDetails,
        status: response.data.Status,
      };
    }
  } catch (error) {
    console.error('[Sumit] Charge one-time error:', error.message);
    if (error.response) {
      console.error('[Sumit] Response data:', error.response.data);
    }
    return {
      success: false,
      error: 'שגיאה בביצוע החיוב. אנא נסה שנית.',
    };
  }
}

/**
 * Create a recurring charge (monthly subscription)
 * This sets up automatic monthly billing
 * 
 * @param {object} params
 * @param {number} params.customerId - Sumit customer ID
 * @param {number} params.amount - Monthly amount (including VAT)
 * @param {string} params.description - Subscription description
 * @param {number} params.durationMonths - Duration between charges (1 = monthly)
 * @param {number} params.recurrence - Number of times to charge (null = unlimited)
 * @returns {Promise<{success: boolean, standingOrderId?: number, transactionId?: string, error?: string}>}
 */
async function chargeRecurring({ 
  customerId, 
  amount, 
  description, 
  durationMonths = 1,
  recurrence = null // null = unlimited recurring
}) {
  const credentials = getCredentials();
  
  try {
    validateCredentials(credentials);
    
    if (!customerId) {
      return { success: false, error: 'נדרש מזהה לקוח' };
    }
    
    if (!amount || amount <= 0) {
      return { success: false, error: 'סכום לא תקין' };
    }
    
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIKey: credentials.APIKey,
      },
      Customer: {
        ID: customerId,
        SearchMode: 0,
      },
      // Use customer's saved payment method
      PaymentMethod: {
        Type: 0, // Use customer's default saved payment method
      },
      Items: [{
        Item: {
          Name: description || 'מנוי חודשי',
          Duration_Months: durationMonths,
        },
        Quantity: 1,
        UnitPrice: amount,
        Currency: 'ILS',
        Duration_Months: durationMonths,
        Recurrence: recurrence, // null = unlimited
      }],
      VATIncluded: true,
      OnlyDocument: false,
      DocumentLanguage: 'he',
      ResponseLanguage: 'he',
    };
    
    console.log('[Sumit] Creating recurring charge - Customer:', customerId, 'Amount:', amount, 'ILS/month');
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/recurring/charge/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
        timeout: 60000,
      }
    );
    
    console.log('[Sumit] Charge recurring response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        standingOrderId: response.data.Data?.StandingOrderID,
        transactionId: response.data.Data?.TransactionID,
        documentNumber: response.data.Data?.DocumentNumber,
        documentURL: response.data.Data?.DocumentURL,
        nextChargeDate: response.data.Data?.NextChargeDate,
        data: response.data.Data,
      };
    } else {
      let userError = response.data.UserErrorMessage || 'יצירת הוראת קבע נכשלה';
      
      if (response.data.TechnicalErrorDetails?.includes('declined')) {
        userError = 'הכרטיס נדחה. אנא בדוק את פרטי הכרטיס.';
      }
      
      return {
        success: false,
        error: userError,
        technicalError: response.data.TechnicalErrorDetails,
        status: response.data.Status,
      };
    }
  } catch (error) {
    console.error('[Sumit] Charge recurring error:', error.message);
    if (error.response) {
      console.error('[Sumit] Response data:', error.response.data);
    }
    return {
      success: false,
      error: 'שגיאה ביצירת הוראת קבע. אנא נסה שנית.',
    };
  }
}

/**
 * Cancel a recurring payment / subscription
 * 
 * @param {number} standingOrderId - The Sumit standing order ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function cancelRecurring(standingOrderId) {
  const credentials = getCredentials();
  
  try {
    validateCredentials(credentials);
    
    if (!standingOrderId) {
      return { success: false, error: 'נדרש מזהה הוראת קבע' };
    }
    
    console.log('[Sumit] Cancelling recurring payment:', standingOrderId);
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/recurring/cancel/`,
      {
        Credentials: {
          CompanyID: credentials.CompanyID,
          APIKey: credentials.APIKey,
        },
        StandingOrderID: standingOrderId,
      },
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
        timeout: 30000,
      }
    );
    
    console.log('[Sumit] Cancel recurring response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return { success: true };
    } else {
      return {
        success: false,
        error: response.data.UserErrorMessage || 'ביטול הוראת קבע נכשל',
        technicalError: response.data.TechnicalErrorDetails,
      };
    }
  } catch (error) {
    console.error('[Sumit] Cancel recurring error:', error.message);
    return {
      success: false,
      error: 'שגיאה בביטול הוראת קבע',
    };
  }
}

/**
 * Get customer's payment methods
 * 
 * @param {number} customerId - Sumit customer ID
 * @returns {Promise<{success: boolean, paymentMethods?: array, error?: string}>}
 */
async function getCustomerPaymentMethods(customerId) {
  const credentials = getCredentials();
  
  try {
    validateCredentials(credentials);
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/paymentmethods/getforcustomer/`,
      {
        Credentials: {
          CompanyID: credentials.CompanyID,
          APIKey: credentials.APIKey,
        },
        CustomerID: customerId,
      },
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
        timeout: 30000,
      }
    );
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        paymentMethods: response.data.Data || [],
      };
    } else {
      return {
        success: false,
        error: response.data.UserErrorMessage || 'טעינת אמצעי תשלום נכשלה',
      };
    }
  } catch (error) {
    console.error('[Sumit] Get payment methods error:', error.message);
    return {
      success: false,
      error: 'שגיאה בטעינת אמצעי תשלום',
    };
  }
}

/**
 * Set payment method for customer using card details directly
 * This is a backend-only tokenization flow when frontend SDK is not available
 * 
 * @param {object} params - Parameters
 * @param {number} params.customerId - Sumit customer ID (optional - will create new if not provided)
 * @param {string} params.cardNumber - Full card number
 * @param {number} params.expiryMonth - Expiry month
 * @param {number} params.expiryYear - Expiry year
 * @param {string} params.cvv - CVV
 * @param {string} params.citizenId - Israeli citizen ID
 * @param {object} params.customerInfo - Customer details
 * @returns {Promise<{success: boolean, customerId?: number, paymentMethodId?: number, last4Digits?: string, error?: string}>}
 */
async function setPaymentMethodWithCard({ 
  customerId, 
  cardNumber, 
  expiryMonth, 
  expiryYear, 
  cvv, 
  citizenId,
  customerInfo 
}) {
  const credentials = getCredentials();
  
  try {
    validateCredentials(credentials);
    
    if (!cardNumber) {
      return {
        success: false,
        error: 'נדרש מספר כרטיס אשראי',
      };
    }
    
    // Build request body with card details directly
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIKey: credentials.APIKey,
      },
      Customer: customerId ? {
        ID: customerId,
        SearchMode: 0,
      } : {
        Name: customerInfo?.name || 'לקוח',
        Phone: customerInfo?.phone || null,
        EmailAddress: customerInfo?.email || null,
        CompanyNumber: customerInfo?.companyNumber || null,
        ExternalIdentifier: customerInfo?.externalId || null,
        SearchMode: 0,
      },
      PaymentMethod: {
        CreditCard_Number: cardNumber.replace(/\s/g, ''),
        CreditCard_ExpirationMonth: parseInt(expiryMonth),
        CreditCard_ExpirationYear: parseInt(expiryYear),
        CreditCard_CVV: cvv,
        CreditCard_CitizenID: citizenId || null,
        Type: 1, // Credit card
      },
      SingleUseToken: null,
    };
    
    console.log('[Sumit] Setting payment method with card for customer:', customerId || 'new customer');
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/paymentmethods/setforcustomer/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
        timeout: 30000,
      }
    );
    
    console.log('[Sumit] Set payment method (card) response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        customerId: response.data.Data?.CustomerID || customerId,
        paymentMethodId: response.data.Data?.PaymentMethodID,
        last4Digits: cardNumber?.slice(-4) || response.data.Data?.Last4Digits,
        expiryMonth: expiryMonth,
        expiryYear: expiryYear,
        data: response.data.Data,
      };
    } else {
      let userError = response.data.UserErrorMessage || 'שמירת כרטיס אשראי נכשלה';
      
      // Parse common errors
      const techError = response.data.TechnicalErrorDetails || '';
      if (techError.includes('declined')) {
        userError = 'הכרטיס נדחה. אנא בדוק את הפרטים.';
      } else if (techError.includes('invalid')) {
        userError = 'פרטי כרטיס לא תקינים.';
      } else if (techError.includes('expired')) {
        userError = 'פג תוקף הכרטיס.';
      }
      
      return {
        success: false,
        error: userError,
        technicalError: response.data.TechnicalErrorDetails,
        status: response.data.Status,
      };
    }
  } catch (error) {
    console.error('[Sumit] Set payment method (card) error:', error.message);
    if (error.response) {
      console.error('[Sumit] Response status:', error.response.status);
      console.error('[Sumit] Response data:', error.response.data);
    }
    return {
      success: false,
      error: 'שגיאה בשמירת כרטיס האשראי. אנא נסה שנית.',
    };
  }
}

module.exports = {
  createCustomer,
  setPaymentMethodForCustomer,
  setPaymentMethodWithCard,
  chargeOneTime,
  chargeRecurring,
  cancelRecurring,
  getCustomerPaymentMethods,
  getCredentials,
};
