const nodemailer = require('nodemailer');

const normalizeEmailValue = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizePassword = (value) => (typeof value === 'string' ? value.replace(/\s+/g, '') : '');

const createTransporter = () => {
  const emailUser = normalizeEmailValue(process.env.EMAIL_USER);
  const emailPass = normalizePassword(process.env.EMAIL_PASS);

  return {
    emailUser,
    emailPass,
    transporter: nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_PORT || 587),
      secure: process.env.EMAIL_SECURE === 'true' || false,
      requireTLS: true,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,
      pool: true,
      maxConnections: 1,
      maxMessages: 3,
      tls: {
        rejectUnauthorized: false,
      },
    }),
  };
};

async function sendPasswordResetEmail({ to, resetUrl }) {
  const { emailUser, emailPass, transporter } = createTransporter();

  if (!emailUser || !emailPass) {
    throw new Error('Email delivery is not configured.');
  }

  return transporter.sendMail({
    from: process.env.EMAIL_FROM || emailUser,
    to,
    subject: 'Password Reset Request',
    html: `
      <h1>Password Reset Request</h1>
      <p>Click the following link to reset your password:</p>
      <a href="${resetUrl}" clicktracking="off">${resetUrl}</a>
    `,
  });
}

module.exports = {
  createTransporter,
  sendPasswordResetEmail,
};
