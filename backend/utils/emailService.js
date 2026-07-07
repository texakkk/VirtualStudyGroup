const axios = require('axios');

const normalizeEmailValue = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizeApiKeyValue = (value) => (typeof value === 'string' ? value.trim() : '');

const resendApiKey = normalizeApiKeyValue(process.env.RESEND_API_KEY);
const defaultSender = normalizeEmailValue(process.env.EMAIL_FROM || process.env.RESEND_FROM || `no-reply@${(process.env.CLIENT_URL || 'virtualstudygroup.app').replace(/^https?:\/\//, '')}`);

const createResendHeaders = () => {
  if (!resendApiKey) {
    throw new Error('Resend API key is not configured. Set RESEND_API_KEY in your environment.');
  }

  return {
    Authorization: `Bearer ${resendApiKey}`,
    'Content-Type': 'application/json',
  };
};

const sendResendEmail = async ({ to, subject, html, text }) => {
  if (!to) {
    throw new Error('Recipient email is required.');
  }

  if (!defaultSender) {
    throw new Error('Email sender is not configured. Set EMAIL_FROM or RESEND_FROM.');
  }

  const payload = {
    from: defaultSender,
    to,
    subject,
    html,
    text,
  };

  try {
    const response = await axios.post(
      'https://api.resend.com/emails',
      payload,
      {
        headers: createResendHeaders(),
        timeout: 20000,
      }
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Resend returned unexpected status ${response.status}`);
    }

    return response.data;
  } catch (error) {
    const responseData = error.response?.data;
    const responseMessage = responseData
      ? typeof responseData === 'string'
        ? responseData
        : JSON.stringify(responseData)
      : error.message;
    throw new Error(`Resend email failed: ${responseMessage}`);
  }
};

async function sendPasswordResetEmail({ to, resetUrl }) {
  const html = `
    <h1>Password Reset Request</h1>
    <p>Click the following link to reset your password:</p>
    <a href="${resetUrl}" clicktracking="off">${resetUrl}</a>
  `;

  const text = `Password Reset Request\n\nClick the following link to reset your password:\n${resetUrl}`;

  return sendResendEmail({
    to,
    subject: 'Password Reset Request',
    html,
    text,
  });
}

module.exports = {
  sendPasswordResetEmail,
};
