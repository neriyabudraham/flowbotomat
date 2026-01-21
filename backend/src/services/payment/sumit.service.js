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
 * Tokenize a credit card (permanent token - for recurring charges)
 * Uses /creditguy/vault/tokenize/ which creates a long-lived token
 */
async function tokenizeCard({ cardNumber }) {
  try {
    const credentials = getCredentials();
    
    if (!credentials.CompanyID || !credentials.APIKey) {
      console.error('[Sumit] Missing credentials for tokenization');
      throw new Error('Sumit credentials not configured');
    }
    
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIKey: credentials.APIKey,
      },
      CardNumber: cardNumber,
      GetFormatPreserving: true,
      ForceFormatPreservingToken: null,
    };
    
    console.log('[Sumit] Tokenizing card (permanent):');
    console.log('[Sumit] - CompanyID:', credentials.CompanyID);
    console.log('[Sumit] - CardNumber:', cardNumber ? cardNumber.substring(0, 4) + '****' : 'MISSING');
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/creditguy/vault/tokenize/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
      }
    );
    
    console.log('[Sumit] Tokenize response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        token: response.data.Data?.Token || response.data.Token,
        formatPreservingToken: response.data.Data?.FormatPreservingToken || response.data.FormatPreservingToken,
      };
    } else {
      return {
        success: false,
        error: response.data.UserErrorMessage || 'טוקניזציה נכשלה',
        technicalError: response.data.TechnicalErrorDetails,
      };
    }
  } catch (error) {
    console.error('[Sumit] Tokenize error:', error.message);
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
  tokenizeCard,
  createCustomer,
  chargeOneTime,
  chargeRecurring,
  cancelRecurring,
  getCredentials,
};
