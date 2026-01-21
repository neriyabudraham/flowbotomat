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
 * Set payment method for customer (long-term tokenization)
 * Uses the short-term token from JavaScript API to create a permanent payment method
 * @param {object} params - Parameters
 * @param {number} params.customerId - Sumit customer ID
 * @param {string} params.singleUseToken - Short-term token from frontend JS API
 * @param {object} params.customerInfo - Customer details for creation/lookup
 */
async function setPaymentMethodForCustomer({ customerId, singleUseToken, customerInfo }) {
  try {
    const credentials = getCredentials();
    
    if (!credentials.CompanyID || !credentials.APIKey) {
      console.error('[Sumit] Missing credentials');
      throw new Error('Sumit credentials not configured');
    }
    
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIKey: credentials.APIKey,
      },
      Customer: customerId ? {
        ID: customerId,
        SearchMode: 0, // Search by ID
      } : {
        Name: customerInfo?.name || 'לקוח',
        Phone: customerInfo?.phone || null,
        EmailAddress: customerInfo?.email || null,
        CompanyNumber: customerInfo?.companyNumber || null,
        ExternalIdentifier: customerInfo?.externalId || null,
        SearchMode: 0,
      },
      SingleUseToken: singleUseToken,
      PaymentMethod: null, // Will be set from token
    };
    
    console.log('[Sumit] Setting payment method for customer:', customerId || 'new');
    console.log('[Sumit] Token (first 10 chars):', singleUseToken?.substring(0, 10) + '...');
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/paymentmethods/setforcustomer/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
      }
    );
    
    console.log('[Sumit] Set payment method response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        customerId: response.data.Data?.CustomerID || customerId,
        paymentMethodId: response.data.Data?.PaymentMethodID,
        last4Digits: response.data.Data?.Last4Digits,
        cardBrand: response.data.Data?.CardBrand,
        data: response.data.Data,
      };
    } else {
      return {
        success: false,
        error: response.data.UserErrorMessage || 'שמירת אמצעי תשלום נכשלה',
        technicalError: response.data.TechnicalErrorDetails,
      };
    }
  } catch (error) {
    console.error('[Sumit] Set payment method error:', error.message);
    if (error.response) {
      console.error('[Sumit] Response data:', error.response.data);
    }
    return {
      success: false,
      error: error.response?.data?.UserErrorMessage || 'שגיאה בתקשורת עם מערכת התשלומים',
    };
  }
}

/**
 * Set payment method for customer using raw card data (fallback when no frontend token)
 * This creates the payment method directly without a pre-existing token
 */
async function setPaymentMethodForCustomerWithCard({ 
  customerId, 
  cardNumber, 
  expiryMonth, 
  expiryYear, 
  cvv, 
  citizenId,
  customerInfo 
}) {
  try {
    const credentials = getCredentials();
    
    if (!credentials.CompanyID || !credentials.APIKey) {
      console.error('[Sumit] Missing credentials');
      throw new Error('Sumit credentials not configured');
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
      PaymentMethod: {
        CreditCard_Number: cardNumber,
        CreditCard_ExpirationMonth: parseInt(expiryMonth),
        CreditCard_ExpirationYear: parseInt(expiryYear),
        CreditCard_CVV: cvv || null,
        CreditCard_CitizenID: citizenId || null,
        Type: 1, // Credit card
      },
      SingleUseToken: null,
    };
    
    console.log('[Sumit] Setting payment method with card data for customer:', customerId);
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/paymentmethods/setforcustomer/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
      }
    );
    
    console.log('[Sumit] Set payment method (card) response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        customerId: response.data.Data?.CustomerID || customerId,
        paymentMethodId: response.data.Data?.PaymentMethodID,
        last4Digits: cardNumber?.slice(-4),
        data: response.data.Data,
      };
    } else {
      return {
        success: false,
        error: response.data.UserErrorMessage || 'שמירת אמצעי תשלום נכשלה',
        technicalError: response.data.TechnicalErrorDetails,
      };
    }
  } catch (error) {
    console.error('[Sumit] Set payment method (card) error:', error.message);
    if (error.response) {
      console.error('[Sumit] Response data:', error.response.data);
    }
    return {
      success: false,
      error: error.response?.data?.UserErrorMessage || 'שגיאה בתקשורת עם מערכת התשלומים',
    };
  }
}

/**
 * Create a customer in Sumit
 */
async function createCustomer({ name, phone, email, citizenId, companyNumber }) {
  try {
    const credentials = getCredentials();
    
    if (!credentials.CompanyID || !credentials.APIKey) {
      throw new Error('Sumit credentials not configured');
    }
    
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIKey: credentials.APIKey,
      },
      Details: {
        Name: name,
        Phone: phone || null,
        EmailAddress: email || null,
        ID: citizenId || null,
        CompanyNumber: companyNumber || null,
        SearchMode: null,
        ExternalIdentifier: null,
        NoVAT: null,
        City: null,
        Address: null,
        ZipCode: null,
        Folder: null,
        Properties: null,
      },
      ResponseLanguage: null,
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
      };
    }
  } catch (error) {
    console.error('[Sumit] Create customer error:', error.message);
    return {
      success: false,
      error: error.response?.data?.UserErrorMessage || 'שגיאה בתקשורת עם מערכת התשלומים',
    };
  }
}

/**
 * Charge a customer with a one-time payment (not recurring)
 * Used for yearly subscriptions and manual charges
 */
async function chargeOneTime({
  customerId,
  cardToken, // Permanent token from tokenizeCard
  expiryMonth,
  expiryYear,
  cvv,
  citizenId,
  amount,
  description,
}) {
  try {
    const credentials = getCredentials();
    
    if (!credentials.CompanyID || !credentials.APIKey) {
      throw new Error('Sumit credentials not configured');
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
      PaymentMethod: {
        CreditCard_Token: cardToken,
        CreditCard_ExpirationMonth: parseInt(expiryMonth),
        CreditCard_ExpirationYear: parseInt(expiryYear),
        CreditCard_CVV: cvv || null,
        CreditCard_CitizenID: citizenId || null,
        Type: 1, // Credit card
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
      DocumentType: null,
      ResponseLanguage: null,
    };
    
    console.log('[Sumit] Charging one-time:', customerId, 'amount:', amount);
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/payments/charge/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
      }
    );
    
    console.log('[Sumit] Charge one-time response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        transactionId: response.data.Data?.TransactionID,
        documentNumber: response.data.Data?.DocumentNumber,
        data: response.data.Data,
      };
    } else {
      return {
        success: false,
        error: response.data.UserErrorMessage || 'חיוב נכשל',
        technicalError: response.data.TechnicalErrorDetails,
      };
    }
  } catch (error) {
    console.error('[Sumit] Charge one-time error:', error.message);
    if (error.response) {
      console.error('[Sumit] Response data:', error.response.data);
    }
    return {
      success: false,
      error: error.response?.data?.UserErrorMessage || 'שגיאה בתקשורת עם מערכת התשלומים',
    };
  }
}

/**
 * Charge a customer with recurring payment (monthly subscription)
 */
async function chargeRecurring({
  customerId,
  cardToken,
  expiryMonth,
  expiryYear,
  cvv,
  citizenId,
  amount,
  description,
  durationMonths = 1,
}) {
  try {
    const credentials = getCredentials();
    
    if (!credentials.CompanyID || !credentials.APIKey) {
      throw new Error('Sumit credentials not configured');
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
      PaymentMethod: {
        CreditCard_Token: cardToken,
        CreditCard_ExpirationMonth: parseInt(expiryMonth),
        CreditCard_ExpirationYear: parseInt(expiryYear),
        CreditCard_CVV: cvv || null,
        CreditCard_CitizenID: citizenId || null,
        Type: 1,
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
        Recurrence: null, // null = recurring until cancelled
      }],
      VATIncluded: true,
      DocumentType: null,
      ResponseLanguage: null,
    };
    
    console.log('[Sumit] Charging recurring:', customerId, 'amount:', amount);
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/recurring/charge/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
      }
    );
    
    console.log('[Sumit] Charge recurring response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        transactionId: response.data.Data?.TransactionID,
        documentNumber: response.data.Data?.DocumentNumber,
        standingOrderId: response.data.Data?.StandingOrderID,
        data: response.data.Data,
      };
    } else {
      return {
        success: false,
        error: response.data.UserErrorMessage || 'חיוב נכשל',
        technicalError: response.data.TechnicalErrorDetails,
      };
    }
  } catch (error) {
    console.error('[Sumit] Charge recurring error:', error.message);
    if (error.response) {
      console.error('[Sumit] Response data:', error.response.data);
    }
    return {
      success: false,
      error: error.response?.data?.UserErrorMessage || 'שגיאה בתקשורת עם מערכת התשלומים',
    };
  }
}

/**
 * Cancel a recurring payment / subscription
 */
async function cancelRecurring(standingOrderId) {
  try {
    const credentials = getCredentials();
    
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
      }
    );
    
    console.log('[Sumit] Cancel recurring response:', JSON.stringify(response.data, null, 2));
    
    return {
      success: response.data.Status === 0 || response.data.Status === 'Success (0)',
      error: response.data.UserErrorMessage,
    };
  } catch (error) {
    console.error('[Sumit] Cancel recurring error:', error.message);
    return {
      success: false,
      error: error.response?.data?.UserErrorMessage || 'שגיאה בביטול הוראת קבע',
    };
  }
}

module.exports = {
  setPaymentMethodForCustomer,
  setPaymentMethodForCustomerWithCard,
  createCustomer,
  chargeOneTime,
  chargeRecurring,
  cancelRecurring,
  getCredentials,
};
