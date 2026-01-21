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
 * Uses JSON format
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
    console.log('[Sumit] - APIPublicKey:', credentials.APIPublicKey ? credentials.APIPublicKey.substring(0, 10) + '...' : 'MISSING');
    console.log('[Sumit] - CardNumber:', cardNumber ? cardNumber.substring(0, 4) + '****' : 'MISSING');
    console.log('[Sumit] - ExpirationMonth:', expiryMonth);
    console.log('[Sumit] - ExpirationYear:', expiryYear);
    
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
    
    // Status 0 = Success
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
 * Charge a customer with a recurring payment
 */
async function chargeCustomer({
  customer, // { name, phone, email, citizenId }
  paymentMethod, // { token, expiryMonth, expiryYear, cvv, citizenId }
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
        CompanyID: parseInt(credentials.CompanyID),
        APIKey: credentials.APIKey,
      },
      Customer: {
        Name: customer.name,
        Phone: customer.phone,
        EmailAddress: customer.email,
        ID: customer.citizenId,
        SearchMode: 0,
      },
      SingleUseToken: paymentMethod.token, // Use single use token
      Items: items.map(item => ({
        Item: {
          Name: item.name,
          Description: item.description,
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
    };
    
    const response = await axios.post(`${SUMIT_BASE_URL}/billing/recurring/charge/`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('[Sumit] Charge response status:', response.data.Status);
    
    if (response.data.Status === 0 || response.data.Status === 'Success (0)') {
      return {
        success: true,
        transactionId: response.data.Data?.TransactionID,
        documentNumber: response.data.Data?.DocumentNumber,
        customerId: response.data.Data?.CustomerID,
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
 * Validate card without charging (authorization only)
 */
async function validateCard({
  customer,
  paymentMethod,
}) {
  return await chargeCustomer({
    customer,
    paymentMethod,
    items: [{
      name: 'אימות כרטיס',
      description: 'בדיקת תקינות כרטיס אשראי - ללא חיוב',
      price: 1,
      durationMonths: 1,
    }],
    options: {
      authoriseOnly: true,
    },
  });
}

/**
 * Cancel a recurring payment / subscription
 */
async function cancelRecurring(transactionId) {
  try {
    const credentials = getCredentials();
    
    const response = await axios.post(`${SUMIT_BASE_URL}/billing/recurring/cancel/`, {
      Credentials: {
        CompanyID: parseInt(credentials.CompanyID),
        APIKey: credentials.APIKey,
      },
      TransactionID: transactionId,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
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
  chargeCustomer,
  validateCard,
  cancelRecurring,
  getCredentials,
};
