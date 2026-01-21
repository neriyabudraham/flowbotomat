const axios = require('axios');

const SUMIT_BASE_URL = 'https://api.sumit.co.il';

/**
 * Get Sumit API credentials from environment
 */
function getCredentials() {
  return {
    CompanyID: parseInt(process.env.SUMIT_CompanyID) || 0,
    APIKey: process.env.SUMIT_APIKey || '',
  };
}

/**
 * Tokenize a credit card number
 * Returns a token that can be used for future charges
 */
async function tokenizeCard(cardNumber) {
  try {
    const credentials = getCredentials();
    
    if (!credentials.CompanyID || !credentials.APIKey) {
      throw new Error('Sumit credentials not configured');
    }
    
    const response = await axios.post(`${SUMIT_BASE_URL}/creditguy/vault/tokenize/`, {
      Credentials: credentials,
      GetFormatPreserving: true,
      CardNumber: cardNumber,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('[Sumit] Tokenize response:', response.data.Status);
    
    if (response.data.Status === 'Success (0)') {
      return {
        success: true,
        token: response.data.Token,
        formatPreservingToken: response.data.FormatPreservingToken,
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
      Credentials: credentials,
      Customer: {
        Name: customer.name,
        Phone: customer.phone,
        EmailAddress: customer.email,
        ID: customer.citizenId,
        SearchMode: 0,
      },
      PaymentMethod: {
        CreditCard_Token: paymentMethod.token,
        CreditCard_ExpirationMonth: paymentMethod.expiryMonth,
        CreditCard_ExpirationYear: paymentMethod.expiryYear,
        CreditCard_CVV: paymentMethod.cvv || null,
        CreditCard_CitizenID: paymentMethod.citizenId || customer.citizenId,
        Type: 1, // Credit card
      },
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
        Recurrence: item.recurrence || null, // Number of recurring payments (null = unlimited)
      })),
      VATIncluded: true,
      DocumentType: options.documentType || null, // null = auto
      AuthoriseOnly: options.authoriseOnly || false,
      OnlyDocument: false,
    };
    
    const response = await axios.post(`${SUMIT_BASE_URL}/billing/recurring/charge/`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('[Sumit] Charge response:', response.data.Status);
    
    if (response.data.Status === 'Success (0)') {
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
      price: 1, // 1 shekel authorization
      durationMonths: 1,
    }],
    options: {
      authoriseOnly: true, // Only authorize, don't capture
    },
  });
}

/**
 * Cancel a recurring payment / subscription
 */
async function cancelRecurring(transactionId) {
  try {
    const credentials = getCredentials();
    
    // Note: This endpoint might be different - check Sumit documentation
    const response = await axios.post(`${SUMIT_BASE_URL}/billing/recurring/cancel/`, {
      Credentials: credentials,
      TransactionID: transactionId,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    return {
      success: response.data.Status === 'Success (0)',
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
