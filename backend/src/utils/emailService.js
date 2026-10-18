const nodemailer = require('nodemailer');

// ONC-001. In NODE_ENV=test nothing is sent: messages are captured in memory (see GET /api/test/emails).
const outbox = [];
let transporter = null;

const isTest = () => process.env.NODE_ENV === 'test';
const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html, meta }) {
  if (isTest()) {
    outbox.push({ to, subject, text, html, ...(meta || {}), sentAt: new Date().toISOString() });
    return { captured: true };
  }
  const t = getTransporter();
  if (!t) {
    console.warn(`SMTP is not configured; email to ${to} was not sent (subject: "${subject}").`);
    return { sent: false };
  }
  await t.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
  return { sent: true };
}

const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESC[c]);

function verificationLink(token) {
  return `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

function sendVerificationEmail(user, token) {
  const link = verificationLink(token);
  return sendMail({
    to: user.email,
    subject: 'Verify your ShopEase email',
    text: `Hi ${user.name},\n\nPlease verify your email to activate your ShopEase account:\n${link}\n\nThis link is valid for 24 hours and can be used once. If you did not sign up, ignore this email.`,
    html: `<p>Hi ${escapeHtml(user.name)},</p><p>Please verify your email to activate your ShopEase account:</p><p><a href="${escapeHtml(link)}">Verify my email</a></p><p>This link is valid for 24 hours and can be used once. If you did not sign up, ignore this email.</p>`,
    meta: { type: 'verification', link, token },
  });
}

const getOutbox = (to) => {
  const want = to ? String(to).trim().toLowerCase() : null;
  return outbox.filter((m) => !want || m.to === want);
};
const clearOutbox = () => {
  outbox.length = 0;
};

module.exports = { sendMail, sendVerificationEmail, verificationLink, getOutbox, clearOutbox };
