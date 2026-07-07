const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'Gmail',
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

async function sendPasswordResetEmail({ to, resetUrl }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email delivery is not configured.');
  }

  return transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
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
  transporter,
  sendPasswordResetEmail,
};
