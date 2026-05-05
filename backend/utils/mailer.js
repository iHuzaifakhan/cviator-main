// backend/utils/mailer.js
// Thin nodemailer wrapper. If SMTP is not configured the email is skipped
// and the link is logged to the console / returned as `devLink` so the
// frontend can auto-verify in development.

const nodemailer = require('nodemailer');
const config = require('../config');

function createTransport() {
  const { host, port, user, pass } = config.smtp;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port:   Number(port) || 587,
    secure: Number(port) === 465,
    auth: { user, pass },
  });
}

async function send(to, subject, html) {
  const transport = createTransport();
  if (!transport) {
    const match   = html.match(/href="([^"]+)"/);
    const devLink = match ? match[1] : null;
    console.log(`[mailer] SMTP not configured — skipping email to ${to}: ${subject}`);
    if (devLink) console.log(`[mailer] Dev link: ${devLink}`);
    return { sent: false, devLink };
  }
  await transport.sendMail({ from: config.smtp.from, to, subject, html });
  return { sent: true, devLink: null };
}

const greeting = (name) => `Hi ${name || 'there'},`;
const footer = `<p style="color:#888;font-size:12px;margin-top:24px">
  This is an automated message from Cviator Pro. If you did not request this, you can ignore it.
</p>`;

async function sendVerificationEmail(to, name, link) {
  return send(
    to,
    'Verify your Cviator email',
    `<p>${greeting(name)}</p>
     <p>Please confirm your email address to activate your Cviator account. The link expires in 24 hours.</p>
     <p><a href="${link}">${link}</a></p>
     ${footer}`
  );
}

async function sendPasswordResetEmail(to, name, link) {
  return send(
    to,
    'Reset your Cviator password',
    `<p>${greeting(name)}</p>
     <p>Click the link below to choose a new password. The link expires in 1 hour.</p>
     <p><a href="${link}">${link}</a></p>
     ${footer}`
  );
}

// Sent to the ROOT admin whenever someone requests an admin account.
async function sendAdminApprovalRequest(rootEmail, requesterEmail, requesterName, link) {
  return send(
    rootEmail,
    `New admin signup request: ${requesterEmail}`,
    `<p>A new admin account has been requested.</p>
     <p><strong>Requester:</strong> ${requesterName || '(no name)'} &lt;${requesterEmail}&gt;</p>
     <p>Approve this request only if you recognise the person and intend for them to have admin access. The link expires in 48 hours.</p>
     <p><a href="${link}">${link}</a></p>
     ${footer}`
  );
}

// Sent to the requesting admin once the root admin approves them.
async function sendAdminApprovedNotice(to, name) {
  return send(
    to,
    'Your Cviator admin account has been approved',
    `<p>${greeting(name)}</p>
     <p>Your admin account has been approved by the root administrator. You can now sign in.</p>
     ${footer}`
  );
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAdminApprovalRequest,
  sendAdminApprovedNotice,
};
