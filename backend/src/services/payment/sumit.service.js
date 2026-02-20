const axios = require('axios');

const SUMIT_BASE_URL = 'https://api.sumit.co.il';

/**
 * Get Sumit API credentials from environment
 */
function getCredentials() {
  const companyIdRaw = process.env.SUMIT_CompanyID?.trim();
  const apiKeyRaw = process.env.SUMIT_APIKey?.trim();
  const publicKeyRaw = process.env.SUMIT_APIPublicKey?.trim();
  
  // Debug log on first use
  console.log('[Sumit] Credentials loaded - CompanyID:', companyIdRaw, 'APIKey first 8 chars:', apiKeyRaw?.substring(0, 8));
  
  return {
    CompanyID: parseInt(companyIdRaw) || 0,
    APIKey: apiKeyRaw || '',
    APIPublicKey: publicKeyRaw || '',
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
 * Create a single-use token from card details
 * Uses CreditGuy Vault API for secure tokenization
 * 
 * @param {object} params - Card details
 * @returns {Promise<{success: boolean, token?: string, error?: string}>}
 */
async function tokenizeSingleUse({ cardNumber, expiryMonth, expiryYear, cvv, citizenId }) {
  const credentials = getCredentials();
  
  try {
    if (!credentials.CompanyID || !credentials.APIPublicKey) {
      return {
        success: false,
        error: 'Missing Sumit public key for tokenization',
      };
    }
    
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIPublicKey: credentials.APIPublicKey,
      },
      CardNumber: cardNumber.replace(/\s/g, ''),
      ExpirationMonth: parseInt(expiryMonth),
      ExpirationYear: parseInt(expiryYear),
      CVV: cvv,
      CitizenID: citizenId || '',
    };
    
    console.log('[Sumit] Creating single-use token...');
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/creditguy/vault/tokenizesingleusejson/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    console.log('[Sumit] Single-use token response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        token: response.data.Data?.SingleUseToken || response.data.SingleUseToken,
        data: response.data.Data || response.data,
      };
    } else {
      return {
        success: false,
        error: response.data.UserErrorMessage || 'יצירת טוקן נכשלה',
        technicalError: response.data.TechnicalErrorDetails,
      };
    }
  } catch (error) {
    console.error('[Sumit] Single-use token error:', error.message);
    if (error.response) {
      console.error('[Sumit] Response:', error.response.data);
    }
    return {
      success: false,
      error: 'שגיאה ביצירת טוקן. אנא נסה שנית.',
    };
  }
}

/**
 * Create a permanent token from single-use token or card number
 * Uses CreditGuy Vault API
 * 
 * @param {object} params - Token or card details
 * @returns {Promise<{success: boolean, permanentToken?: string, error?: string}>}
 */
async function tokenizePermanent({ singleUseToken, cardNumber }) {
  const credentials = getCredentials();
  
  try {
    validateCredentials(credentials);
    
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIKey: credentials.APIKey,
      },
      GetFormatPreserving: true,
    };
    
    if (singleUseToken) {
      requestBody.ForceFormatPreservingToken = singleUseToken;
    } else if (cardNumber) {
      requestBody.CardNumber = cardNumber.replace(/\s/g, '');
    } else {
      return {
        success: false,
        error: 'נדרש טוקן או מספר כרטיס',
      };
    }
    
    console.log('[Sumit] Creating permanent token...');
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/creditguy/vault/tokenize/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    console.log('[Sumit] Permanent token response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        permanentToken: response.data.Data?.Token || response.data.Token,
        formatPreservingToken: response.data.Data?.FormatPreservingToken || response.data.FormatPreservingToken,
        data: response.data.Data || response.data,
      };
    } else {
      return {
        success: false,
        error: response.data.UserErrorMessage || 'יצירת טוקן קבוע נכשלה',
        technicalError: response.data.TechnicalErrorDetails,
      };
    }
  } catch (error) {
    console.error('[Sumit] Permanent token error:', error.message);
    if (error.response) {
      console.error('[Sumit] Response:', error.response.data);
    }
    return {
      success: false,
      error: 'שגיאה ביצירת טוקן קבוע. אנא נסה שנית.',
    };
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
    
    // Debug: log credentials being used (mask API key)
    console.log('[Sumit] Using credentials - CompanyID:', credentials.CompanyID, 'APIKey:', credentials.APIKey ? `${credentials.APIKey.substring(0, 8)}...` : 'MISSING');
    
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
    
    // DEBUG: Log full request body
    const safeRequestBody = JSON.parse(JSON.stringify(requestBody));
    safeRequestBody.Credentials.APIKey = safeRequestBody.Credentials.APIKey?.substring(0, 8) + '...';
    console.log('[Sumit] createCustomer REQUEST BODY:', JSON.stringify(safeRequestBody, null, 2));
    
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
      // Don't send PaymentMethod - Sumit uses the customer's default saved payment method
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
      SendDocumentByEmail_Language: 0, // 0 = Hebrew
      DocumentLanguage: 0, // 0 = Hebrew, 1 = English
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
 * Create a recurring charge (monthly or yearly subscription)
 * This sets up automatic recurring billing
 * 
 * @param {object} params
 * @param {number} params.customerId - Sumit customer ID
 * @param {number} params.amount - Amount per period (including VAT)
 * @param {string} params.description - Subscription description
 * @param {number} params.durationMonths - Duration between charges (1 = monthly, 12 = yearly)
 * @param {number} params.recurrence - Number of times to charge (null = unlimited)
 * @param {Date|string} params.startDate - First charge date (null = charge now, future date = schedule)
 * @returns {Promise<{success: boolean, standingOrderId?: number, transactionId?: string, error?: string}>}
 */
async function chargeRecurring({ 
  customerId, 
  amount, 
  description, 
  durationMonths = 1,
  recurrence = null, // null = unlimited recurring
  startDate = null   // null = charge now, future date = first charge on that date
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
    
    const periodLabel = durationMonths === 12 ? 'שנתי' : durationMonths === 1 ? 'חודשי' : `${durationMonths} חודשים`;
    
    // Ensure amount is a number (PostgreSQL DECIMAL comes as string)
    const numericAmount = parseFloat(amount);
    
    console.log('[Sumit] chargeRecurring - numericAmount:', numericAmount, 'original:', amount, 'type:', typeof amount);
    
    const itemData = {
      Item: {
        Name: description || `מנוי ${periodLabel}`,
        Duration_Months: durationMonths,
      },
      Quantity: 1,
      UnitPrice: numericAmount,
      Currency: 'ILS',
      Duration_Months: durationMonths,
      Recurrence: recurrence, // null = unlimited
    };
    
    // If start date is in the future, format it properly for Sumit
    // Sumit expects: YYYY-MM-DD format, not ISO string
    if (startDate) {
      const dateObj = startDate instanceof Date ? startDate : new Date(startDate);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      itemData.Date_Start = `${year}-${month}-${day}`;
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
      // Don't send PaymentMethod - Sumit uses the customer's default saved payment method
      Items: [itemData],
      VATIncluded: true,
      OnlyDocument: false,
      DocumentLanguage: 0, // 0 = Hebrew, 1 = English
      ResponseLanguage: 'he',
    };
    
    const periodText = durationMonths === 12 ? 'ILS/year' : durationMonths === 1 ? 'ILS/month' : `ILS/${durationMonths}mo`;
    const startDateText = itemData.Date_Start ? `, Start: ${itemData.Date_Start}` : ' (immediate)';
    console.log(`[Sumit] Creating recurring charge - Customer: ${customerId}, Amount: ${numericAmount} ${periodText}, Duration: ${durationMonths} months${startDateText}`);
    
    // DEBUG: Log full request body
    const safeRequestBody = JSON.parse(JSON.stringify(requestBody));
    safeRequestBody.Credentials.APIKey = safeRequestBody.Credentials.APIKey?.substring(0, 8) + '...';
    console.log('[Sumit] chargeRecurring REQUEST BODY:', JSON.stringify(safeRequestBody, null, 2));
    
    console.log(`[Sumit] Making recurring charge request to: ${SUMIT_BASE_URL}/billing/recurring/charge/`);
    console.log('[Sumit] Credentials check - CompanyID:', credentials.CompanyID, 'APIKey length:', credentials.APIKey?.length);
    
    let response;
    try {
      response = await axios.post(
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
    } catch (axiosError) {
      console.error('[Sumit] HTTP error during chargeRecurring:', axiosError.response?.status, axiosError.response?.statusText);
      console.error('[Sumit] Error response body:', JSON.stringify(axiosError.response?.data, null, 2));
      throw axiosError;
    }
    
    console.log('[Sumit] HTTP Response status:', response.status);
    console.log('[Sumit] Charge recurring response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        standingOrderId: response.data.Data?.RecurringCustomerItemIDs?.[0] || response.data.Data?.StandingOrderID,
        transactionId: response.data.Data?.Payment?.ID || response.data.Data?.TransactionID,
        documentNumber: response.data.Data?.DocumentID || response.data.Data?.DocumentNumber,
        documentURL: response.data.Data?.DocumentDownloadURL || response.data.Data?.DocumentURL,
        nextChargeDate: response.data.Data?.NextChargeDate,
        paymentId: response.data.Data?.Payment?.ID,
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
 * @param {number} recurringCustomerItemId - The Sumit RecurringCustomerItemID (standing order ID)
 * @param {number} customerId - The Sumit Customer ID (optional, for additional verification)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function cancelRecurring(recurringCustomerItemId, customerId) {
  const credentials = getCredentials();
  
  try {
    validateCredentials(credentials);
    
    if (!recurringCustomerItemId) {
      return { success: false, error: 'נדרש מזהה הוראת קבע' };
    }
    
    if (!customerId) {
      return { success: false, error: 'נדרש מזהה לקוח לביטול הוראת קבע' };
    }
    
    console.log('[Sumit] Cancelling recurring payment:', recurringCustomerItemId, 'for customer:', customerId);
    
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIKey: credentials.APIKey,
      },
      RecurringCustomerItemID: parseInt(recurringCustomerItemId),
      Customer: {
        ID: parseInt(customerId),
        SearchMode: 0,
      },
    };
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/recurring/cancel/`,
      requestBody,
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
    if (error.response) {
      console.error('[Sumit] Response data:', error.response.data);
    }
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
  phone,
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
        Phone: phone || customerInfo?.phone || null,
        EmailAddress: customerInfo?.email || null,
        Personal_ID: citizenId || null,
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
    
    // DEBUG: Log full request body (mask card number)
    const safeRequestBody = JSON.parse(JSON.stringify(requestBody));
    safeRequestBody.Credentials.APIKey = safeRequestBody.Credentials.APIKey?.substring(0, 8) + '...';
    if (safeRequestBody.PaymentMethod?.CreditCard_Number) {
      safeRequestBody.PaymentMethod.CreditCard_Number = '****' + safeRequestBody.PaymentMethod.CreditCard_Number.slice(-4);
    }
    if (safeRequestBody.PaymentMethod?.CreditCard_CVV) {
      safeRequestBody.PaymentMethod.CreditCard_CVV = '***';
    }
    console.log('[Sumit] setPaymentMethodWithCard REQUEST BODY:', JSON.stringify(safeRequestBody, null, 2));
    
    console.log(`[Sumit] Making request to: ${SUMIT_BASE_URL}/billing/paymentmethods/setforcustomer/`);
    console.log('[Sumit] Credentials check - CompanyID:', credentials.CompanyID, 'APIKey length:', credentials.APIKey?.length);
    
    let response;
    try {
      response = await axios.post(
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
    } catch (axiosError) {
      console.error('[Sumit] HTTP error:', axiosError.response?.status, axiosError.response?.statusText);
      console.error('[Sumit] Response body:', JSON.stringify(axiosError.response?.data, null, 2));
      throw axiosError;
    }
    
    console.log('[Sumit] HTTP Response status:', response.status);
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
  tokenizeSingleUse,
  tokenizePermanent,
  chargeOneTime,
  chargeRecurring,
  cancelRecurring,
  getCustomerPaymentMethods,
  getCredentials,
};
