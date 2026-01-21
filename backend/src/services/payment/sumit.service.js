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
 * Tokenize a credit card (single use token)
 */
async function tokenizeCard({ cardNumber, expiryMonth, expiryYear, cvv, citizenId }) {
  try {
    const credentials = getCredentials();
    
    if (!credentials.CompanyID || !credentials.APIPublicKey) {
      console.error('[Sumit] Missing credentials - CompanyID:', !!credentials.CompanyID, 'APIPublicKey:', !!credentials.APIPublicKey);
      throw new Error('Sumit credentials not configured');
    }
    
    const requestBody = {
      Credentials: {
        CompanyID: credentials.CompanyID,
        APIPublicKey: credentials.APIPublicKey,
      },
      CardNumber: cardNumber,
      ExpirationMonth: parseInt(expiryMonth),
      ExpirationYear: parseInt(expiryYear),
      CVV: cvv || '',
      CitizenID: citizenId || '',
    };
    
    console.log('[Sumit] Tokenizing card:');
    console.log('[Sumit] - CompanyID:', credentials.CompanyID);
    console.log('[Sumit] - CardNumber:', cardNumber ? cardNumber.substring(0, 4) + '****' : 'MISSING');
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/creditguy/vault/tokenizesingleusejson/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
      }
    );
    
    console.log('[Sumit] Tokenize response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.Status === 0) {
      return {
        success: true,
        token: response.data.Data?.SingleUseToken,
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
 * Charge a customer
 */
async function chargeCustomer({
  customerId, // Sumit CustomerID
  singleUseToken, // Token from tokenization
  items, // [{ name, description, price, durationMonths, recurrence }]
  options = {}
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
      SingleUseToken: singleUseToken,
      Items: items.map(item => ({
        Item: {
          Name: item.name,
          Description: item.description || null,
          Duration_Months: item.durationMonths || 1,
        },
        Quantity: 1,
        UnitPrice: item.price,
        Currency: 'ILS',
        Duration_Months: item.durationMonths || 1,
        Recurrence: item.recurrence || null,
      })),
      VATIncluded: true,
      DocumentType: options.documentType || null,
      AuthoriseOnly: options.authoriseOnly || false,
      OnlyDocument: false,
      ResponseLanguage: null,
    };
    
    console.log('[Sumit] Charging customer:', customerId, 'amount:', items.reduce((sum, i) => sum + i.price, 0));
    
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
    
    console.log('[Sumit] Charge response:', JSON.stringify(response.data, null, 2));
    
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
    console.error('[Sumit] Charge error:', error.message);
    return {
      success: false,
      error: error.response?.data?.UserErrorMessage || 'שגיאה בתקשורת עם מערכת התשלומים',
    };
  }
}

/**
 * Cancel a recurring payment / subscription
 */
async function cancelRecurring(transactionId) {
  try {
    const credentials = getCredentials();
    
    const response = await axios.post(
      `${SUMIT_BASE_URL}/billing/recurring/cancel/`,
      {
        Credentials: {
          CompanyID: credentials.CompanyID,
          APIKey: credentials.APIKey,
        },
        TransactionID: transactionId,
      },
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
          'accept': 'text/plain',
        },
      }
    );
    
    return {
      success: response.data.Status === 0,
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
  chargeCustomer,
  cancelRecurring,
  getCredentials,
};
