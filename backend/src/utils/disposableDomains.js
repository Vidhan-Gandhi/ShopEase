// Common disposable / throw-away email domains (ONC-001). Subdomains of these are blocked too.
const DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz', 'guerrillamailblock.com',
  'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me', '10minutemail.com', '10minutemail.net', '10minemail.com',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net', 'tempmailo.com', 'tempail.com', 'tempinbox.com',
  'throwawaymail.com', 'trashmail.com', 'trashmail.net', 'trashmail.de', 'trash-mail.com', 'yopmail.com', 'yopmail.net',
  'yopmail.fr', 'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'mailcatch.com',
  'fakeinbox.com', 'fakemail.net', 'mintemail.com', 'mohmal.com', 'mytemp.email', 'burnermail.io', 'discard.email',
  'emailondeck.com', 'getairmail.com', 'harakirimail.com', 'inboxbear.com', 'jetable.org', 'mailforspam.com',
  'mailtemp.info', 'mytrashmail.com', 'spambox.us', 'spamgourmet.com', 'tempr.email', 'throwam.com', 'tmail.ws',
  'tmpmail.net', 'tmpmail.org', 'moakt.com', 'emailfake.com', 'fakemailgenerator.com', 'instantemailaddress.com',
  'mailsac.com', 'mail.tm', 'dropmail.me', 'anonbox.net', '33mail.com', 'guerrillamail.de', 'e4ward.com',
  'dayrep.com', 'cuvox.de', 'einrot.com', 'fleckens.hu', 'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com',
  'teleworm.us', 'armyspy.com', 'disposable.com', 'disposablemail.com',
]);

function isDisposable(email) {
  const at = String(email).lastIndexOf('@');
  if (at < 0) return false;
  const parts = String(email).slice(at + 1).trim().toLowerCase().split('.');
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (DOMAINS.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

module.exports = { isDisposable, DISPOSABLE_DOMAINS: DOMAINS };
