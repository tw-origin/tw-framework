/**
 * Validation utilities -- email, phone, URL, IP, credit card, etc.
 * @module shared/utils/validate
 */

export type ValidationResult = { valid: boolean; message?: string; code?: string };

export function validateEmail(email: string): ValidationResult {
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!email) return { valid: false, message: "Email is required", code: "EMAIL_REQUIRED" };
  if (email.length > 254) return { valid: false, message: "Email is too long", code: "EMAIL_TOO_LONG" };
  if (!regex.test(email)) return { valid: false, message: "Invalid email format", code: "EMAIL_INVALID" };
  const [local, domain] = email.split("@");
  if (local.length > 64) return { valid: false, message: "Local part too long", code: "EMAIL_LOCAL_TOO_LONG" };
  if (!domain.includes(".")) return { valid: false, message: "Domain must include a dot", code: "EMAIL_DOMAIN_NO_DOT" };
  const tld = domain.split(".").pop()!;
  if (tld.length < 2) return { valid: false, message: "TLD too short", code: "EMAIL_TLD_SHORT" };
  return { valid: true };
}

export function isValidEmail(email: string): boolean {
  return validateEmail(email).valid;
}

export function validatePhone(phone: string): ValidationResult {
  const cleaned = phone.replace(/[\s\-().]/g, "");
  if (!cleaned) return { valid: false, message: "Phone is required", code: "PHONE_REQUIRED" };
  if (!/^\+?\d{7,15}$/.test(cleaned)) return { valid: false, message: "Invalid phone format", code: "PHONE_INVALID" };
  return { valid: true };
}

export function isValidPhone(phone: string): boolean {
  return validatePhone(phone).valid;
}

export function validateURL(url: string): ValidationResult {
  if (!url) return { valid: false, message: "URL is required", code: "URL_REQUIRED" };
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.match(/^https?:$/i)) return { valid: false, message: "Only HTTP(S) allowed", code: "URL_PROTOCOL" };
    if (!parsed.hostname) return { valid: false, message: "Missing hostname", code: "URL_NO_HOST" };
    if (parsed.hostname.length > 253) return { valid: false, message: "Hostname too long", code: "URL_HOST_LONG" };
    return { valid: true };
  } catch {
    return { valid: false, message: "Invalid URL", code: "URL_INVALID" };
  }
}

export function isValidURL(url: string): boolean {
  return validateURL(url).valid;
}

export function validateIPv4(ip: string): ValidationResult {
  const parts = ip.split(".");
  if (parts.length !== 4) return { valid: false, message: "Invalid IPv4 format", code: "IPV4_FORMAT" };
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return { valid: false, message: "Invalid octet", code: "IPV4_OCTET" };
    if (part !== String(num)) return { valid: false, message: "Invalid format", code: "IPV4_FORMAT" };
  }
  return { valid: true };
}

export function isValidIPv4(ip: string): boolean {
  return validateIPv4(ip).valid;
}

export function validateIPv6(ip: string): ValidationResult {
  const regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(::[0-9a-fA-F]{1,4}){1,7}|([0-9a-fA-F]{1,4}::){1,6}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}::){1,5}([0-9a-fA-F]{1,4}:){1,2}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}::){1,4}([0-9a-fA-F]{1,4}:){1,3}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}::){1,3}([0-9a-fA-F]{1,4}:){1,4}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}::){1,2}([0-9a-fA-F]{1,4}:){1,5}[0-9a-fA-F]{1,4}|[0-9a-fA-F]{1,4}::([0-9a-fA-F]{1,4}:){1,6}[0-9a-fA-F]{1,4})$/;
  if (!regex.test(ip)) return { valid: false, message: "Invalid IPv6 format", code: "IPV6_FORMAT" };
  return { valid: true };
}

export function isValidIPv6(ip: string): boolean {
  return validateIPv6(ip).valid;
}

export function validateIP(ip: string): ValidationResult {
  return validateIPv4(ip).valid ? validateIPv4(ip) : validateIPv6(ip);
}

export function isValidIP(ip: string): boolean {
  return validateIP(ip).valid;
}

export function validateMAC(mac: string): ValidationResult {
  const regex = /^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/;
  if (!regex.test(mac)) return { valid: false, message: "Invalid MAC address", code: "MAC_INVALID" };
  return { valid: true };
}

export function isValidMAC(mac: string): boolean {
  return validateMAC(mac).valid;
}

export function validateCreditCard(card: string): ValidationResult {
  const cleaned = card.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(cleaned)) return { valid: false, message: "Invalid card number length", code: "CC_LENGTH" };
  if (!luhnCheck(cleaned)) return { valid: false, message: "Failed Luhn check", code: "CC_LUHN" };
  const type = getCreditCardType(cleaned);
  if (!type) return { valid: false, message: "Unknown card type", code: "CC_TYPE" };
  return { valid: true, code: type };
}

export function isValidCreditCard(card: string): boolean {
  return validateCreditCard(card).valid;
}

export function getCreditCardType(card: string): string | null {
  const cleaned = card.replace(/[\s-]/g, "");
  if (/^4[0-9]{12}(?:[0-9]{3})?(?:[0-9]{3})?$/.test(cleaned)) return "visa";
  if (/^5[1-5][0-9]{14}$/.test(cleaned)) return "mastercard";
  if (/^3[47][0-9]{13}$/.test(cleaned)) return "amex";
  if (/^6(?:011|5[0-9]{2})[0-9]{12}$/.test(cleaned)) return "discover";
  if (/^(?:2131|1800|35[0-9]{3})[0-9]{11}$/.test(cleaned)) return "jcb";
  if (/^3(?:0[0-5]|[68][0-9])[0-9]{11}$/.test(cleaned)) return "diners";
  return null;
}

function luhnCheck(cardNumber: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cardNumber[i], 10);
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export function validateISBN(isbn: string): ValidationResult {
  const cleaned = isbn.replace(/[\s-]/g, "");
  if (cleaned.length === 10) {
    if (!/^\d{9}[\dX]$/.test(cleaned)) return { valid: false, message: "Invalid ISBN-10", code: "ISBN10_FORMAT" };
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(cleaned[i], 10) * (10 - i);
    sum += cleaned[9] === "X" ? 10 : parseInt(cleaned[9], 10);
    if (sum % 11 !== 0) return { valid: false, message: "ISBN-10 checksum failed", code: "ISBN10_CHECKSUM" };
    return { valid: true };
  }
  if (cleaned.length === 13) {
    if (!/^\d{13}$/.test(cleaned)) return { valid: false, message: "Invalid ISBN-13", code: "ISBN13_FORMAT" };
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(cleaned[i], 10) * (i % 2 === 0 ? 1 : 3);
    const check = (10 - (sum % 10)) % 10;
    if (check !== parseInt(cleaned[12], 10)) return { valid: false, message: "ISBN-13 checksum failed", code: "ISBN13_CHECKSUM" };
    return { valid: true };
  }
  return { valid: false, message: "Invalid ISBN length", code: "ISBN_LENGTH" };
}

export function isValidISBN(isbn: string): boolean {
  return validateISBN(isbn).valid;
}

export function validateUUID(uuid: string): ValidationResult {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!regex.test(uuid)) return { valid: false, message: "Invalid UUID", code: "UUID_FORMAT" };
  return { valid: true };
}

export function isValidUUID(uuid: string): boolean {
  return validateUUID(uuid).valid;
}

export function validateZipCode(zip: string, country: string = "US"): ValidationResult {
  const patterns: Record<string, RegExp> = {
    US: /^\d{5}(-\d{4})?$/,
    IN: /^\d{6}$/,
    UK: /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/i,
    CA: /^[A-Z]\d[A-Z] \d[A-Z]\d$/i,
    DE: /^\d{5}$/,
    FR: /^\d{5}$/,
    JP: /^\d{3}-\d{4}$/,
    AU: /^\d{4}$/,
    BR: /^\d{5}-\d{3}$/,
    CN: /^\d{6}$/,
  };
  const pattern = patterns[country];
  if (!pattern) return { valid: false, message: "Unknown country", code: "ZIP_COUNTRY" };
  if (!pattern.test(zip)) return { valid: false, message: `Invalid ${country} zip code`, code: "ZIP_FORMAT" };
  return { valid: true };
}

export function isValidZipCode(zip: string, country: string = "US"): boolean {
  return validateZipCode(zip, country).valid;
}

export function validateSSN(ssn: string): ValidationResult {
  const cleaned = ssn.replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(cleaned)) return { valid: false, message: "Invalid SSN format", code: "SSN_FORMAT" };
  if (cleaned[0] === "0") return { valid: false, message: "Invalid SSN area", code: "SSN_AREA" };
  if (cleaned[3] === "0" && cleaned[4] === "0") return { valid: false, message: "Invalid SSN group", code: "SSN_GROUP" };
  if (cleaned[5] === "0" && cleaned[6] === "0" && cleaned[7] === "0" && cleaned[8] === "0") return { valid: false, message: "Invalid SSN serial", code: "SSN_SERIAL" };
  if (cleaned === "123456789") return { valid: false, message: "Invalid SSN", code: "SSN_DUMMY" };
  if (cleaned.slice(0, 3) === "666") return { valid: false, message: "Invalid SSN area", code: "SSN_AREA_666" };
  if (parseInt(cleaned.slice(0, 3), 10) > 899) return { valid: false, message: "Invalid SSN area", code: "SSN_AREA_HIGH" };
  return { valid: true };
}

export function isValidSSN(ssn: string): boolean {
  return validateSSN(ssn).valid;
}

export function validateHexColor(color: string): ValidationResult {
  const regex = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  if (!regex.test(color)) return { valid: false, message: "Invalid hex color", code: "COLOR_HEX" };
  return { valid: true };
}

export function isValidHexColor(color: string): boolean {
  return validateHexColor(color).valid;
}

export function validateRGB(rgb: string): ValidationResult {
  const match = rgb.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (!match) return { valid: false, message: "Invalid RGB format", code: "COLOR_RGB" };
  for (let i = 1; i <= 3; i++) {
    const val = parseInt(match[i], 10);
    if (val > 255) return { valid: false, message: `RGB value ${val} out of range`, code: "COLOR_RGB_RANGE" };
  }
  return { valid: true };
}

export function isValidRGB(rgb: string): boolean {
  return validateRGB(rgb).valid;
}

export function validateRGBA(rgba: string): ValidationResult {
  const match = rgba.match(/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01]\.?\d*)\s*\)$/i);
  if (!match) return { valid: false, message: "Invalid RGBA format", code: "COLOR_RGBA" };
  for (let i = 1; i <= 3; i++) {
    const val = parseInt(match[i], 10);
    if (val > 255) return { valid: false, message: `RGBA value ${val} out of range`, code: "COLOR_RGBA_RANGE" };
  }
  const alpha = parseFloat(match[4]);
  if (alpha < 0 || alpha > 1) return { valid: false, message: "Alpha out of range", code: "COLOR_RGBA_ALPHA" };
  return { valid: true };
}

export function isValidRGBA(rgba: string): boolean {
  return validateRGBA(rgba).valid;
}

export function validateHSL(hsl: string): ValidationResult {
  const match = hsl.match(/^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/i);
  if (!match) return { valid: false, message: "Invalid HSL format", code: "COLOR_HSL" };
  const hue = parseInt(match[1], 10);
  const sat = parseInt(match[2], 10);
  const light = parseInt(match[3], 10);
  if (hue > 360) return { valid: false, message: "Hue out of range", code: "COLOR_HSL_HUE" };
  if (sat > 100) return { valid: false, message: "Saturation out of range", code: "COLOR_HSL_SAT" };
  if (light > 100) return { valid: false, message: "Lightness out of range", code: "COLOR_HSL_LIGHT" };
  return { valid: true };
}

export function isValidHSL(hsl: string): boolean {
  return validateHSL(hsl).valid;
}

export function validateDate(date: string): ValidationResult {
  if (!date) return { valid: false, message: "Date is required", code: "DATE_REQUIRED" };
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return { valid: false, message: "Invalid date", code: "DATE_INVALID" };
  return { valid: true };
}

export function isValidDate(date: string): boolean {
  return validateDate(date).valid;
}

export function validateISODate(date: string): ValidationResult {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) return { valid: false, message: "Invalid ISO date format", code: "DATE_ISO_FORMAT" };
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return { valid: false, message: "Invalid date", code: "DATE_INVALID" };
  return { valid: true };
}

export function isValidISODate(date: string): boolean {
  return validateISODate(date).valid;
}

export function validateISODateTime(date: string): ValidationResult {
  const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
  if (!regex.test(date)) return { valid: false, message: "Invalid ISO datetime format", code: "DATETIME_ISO_FORMAT" };
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return { valid: false, message: "Invalid datetime", code: "DATETIME_INVALID" };
  return { valid: true };
}

export function isValidISODateTime(date: string): boolean {
  return validateISODateTime(date).valid;
}

export function validateTime(time: string): ValidationResult {
  const regex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/;
  if (!regex.test(time)) return { valid: false, message: "Invalid time format", code: "TIME_FORMAT" };
  return { valid: true };
}

export function isValidTime(time: string): boolean {
  return validateTime(time).valid;
}

export function validateLatitude(lat: number): ValidationResult {
  if (isNaN(lat)) return { valid: false, message: "Latitude is NaN", code: "LAT_NAN" };
  if (lat < -90) return { valid: false, message: "Latitude below -90", code: "LAT_LOW" };
  if (lat > 90) return { valid: false, message: "Latitude above 90", code: "LAT_HIGH" };
  return { valid: true };
}

export function validateLongitude(lng: number): ValidationResult {
  if (isNaN(lng)) return { valid: false, message: "Longitude is NaN", code: "LNG_NAN" };
  if (lng < -180) return { valid: false, message: "Longitude below -180", code: "LNG_LOW" };
  if (lng > 180) return { valid: false, message: "Longitude above 180", code: "LNG_HIGH" };
  return { valid: true };
}

export function validateCoordinates(lat: number, lng: number): ValidationResult {
  const latResult = validateLatitude(lat);
  if (!latResult.valid) return latResult;
  return validateLongitude(lng);
}

export function validatePassword(password: string, options: { minLength?: number; maxLength?: number; requireUppercase?: boolean; requireLowercase?: boolean; requireNumbers?: boolean; requireSpecialChars?: boolean; specialChars?: string } = {}): ValidationResult {
  const { minLength = 8, maxLength = 128, requireUppercase = true, requireLowercase = true, requireNumbers = true, requireSpecialChars = true, specialChars = "!@#$%^&*()_+-=[]{}|;:,.?~" } = options;
  if (!password) return { valid: false, message: "Password is required", code: "PASSWORD_REQUIRED" };
  if (password.length < minLength) return { valid: false, message: `Password must be at least ${minLength} characters`, code: "PASSWORD_SHORT" };
  if (password.length > maxLength) return { valid: false, message: `Password must be at most ${maxLength} characters`, code: "PASSWORD_LONG" };
  if (requireUppercase && !/[A-Z]/.test(password)) return { valid: false, message: "Password must contain uppercase", code: "PASSWORD_NO_UPPER" };
  if (requireLowercase && !/[a-z]/.test(password)) return { valid: false, message: "Password must contain lowercase", code: "PASSWORD_NO_LOWER" };
  if (requireNumbers && !/\d/.test(password)) return { valid: false, message: "Password must contain numbers", code: "PASSWORD_NO_NUMBER" };
  if (requireSpecialChars && !new RegExp(`[${specialChars.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]`).test(password)) return { valid: false, message: "Password must contain special characters", code: "PASSWORD_NO_SPECIAL" };
  return { valid: true };
}

export function getPasswordStrength(password: string): { score: number; label: string; suggestions: string[] } {
  let score = 0;
  const suggestions: string[] = [];
  if (password.length >= 8) score++;
  else suggestions.push("Use at least 8 characters");
  if (password.length >= 12) score++;
  else suggestions.push("Use at least 12 characters");
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password)) score++;
  else suggestions.push("Add lowercase letters");
  if (/[A-Z]/.test(password)) score++;
  else suggestions.push("Add uppercase letters");
  if (/\d/.test(password)) score++;
  else suggestions.push("Add numbers");
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  else suggestions.push("Add special characters");
  if (!/(.)\1{2,}/.test(password)) score++;
  else suggestions.push("Avoid repeated characters");
  if (!/^123|abc|qwe|password|admin/i.test(password)) score++;
  else suggestions.push("Avoid common patterns");
  const label = score <= 2 ? "very weak" : score <= 4 ? "weak" : score <= 6 ? "fair" : score <= 8 ? "strong" : "very strong";
  return { score, label, suggestions };
}

export function validateUsername(username: string, options: { minLength?: number; maxLength?: number; pattern?: RegExp; allowedChars?: string } = {}): ValidationResult {
  const { minLength = 3, maxLength = 30, pattern } = options;
  if (!username) return { valid: false, message: "Username is required", code: "USERNAME_REQUIRED" };
  if (username.length < minLength) return { valid: false, message: `Username must be at least ${minLength} characters`, code: "USERNAME_SHORT" };
  if (username.length > maxLength) return { valid: false, message: `Username must be at most ${maxLength} characters`, code: "USERNAME_LONG" };
  if (pattern && !pattern.test(username)) return { valid: false, message: "Invalid username format", code: "USERNAME_FORMAT" };
  return { valid: true };
}

export function validateSlug(slug: string): ValidationResult {
  if (!slug) return { valid: false, message: "Slug is required", code: "SLUG_REQUIRED" };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { valid: false, message: "Invalid slug format", code: "SLUG_FORMAT" };
  if (slug.length > 100) return { valid: false, message: "Slug too long", code: "SLUG_LONG" };
  return { valid: true };
}

export function validateSemver(version: string): ValidationResult {
  const regex = /^\d+\.\d+\.\d+(?:-[0-9a-z-]+(?:\.[0-9a-z-]+)*)?(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i;
  if (!regex.test(version)) return { valid: false, message: "Invalid semver format", code: "SEMVER_FORMAT" };
  return { valid: true };
}

export function isValidSemver(version: string): boolean {
  return validateSemver(version).valid;
}

export function validateJWT(token: string): ValidationResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, message: "JWT must have 3 parts", code: "JWT_PARTS" };
  try {
    const header = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
    if (!header.alg) return { valid: false, message: "Missing algorithm in header", code: "JWT_NO_ALG" };
    if (!header.typ) return { valid: false, message: "Missing type in header", code: "JWT_NO_TYP" };
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return { valid: false, message: "Token expired", code: "JWT_EXPIRED" };
    if (payload.nbf && payload.nbf > Math.floor(Date.now() / 1000)) return { valid: false, message: "Token not yet valid", code: "JWT_NOT_YET" };
    if (payload.iat && payload.iat > Math.floor(Date.now() / 1000) + 60) return { valid: false, message: "Token issued in future", code: "JWT_FUTURE_IAT" };
    return { valid: true };
  } catch {
    return { valid: false, message: "Invalid JWT encoding", code: "JWT_ENCODING" };
  }
}

export function isValidJWT(token: string): boolean {
  return validateJWT(token).valid;
}

export function validateJSON(str: string): ValidationResult {
  try {
    JSON.parse(str);
    return { valid: true };
  } catch {
    return { valid: false, message: "Invalid JSON", code: "JSON_INVALID" };
  }
}

export function isValidJSON(str: string): boolean {
  return validateJSON(str).valid;
}

export function validateBase64(str: string): ValidationResult {
  const regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!regex.test(str)) return { valid: false, message: "Invalid base64 format", code: "BASE64_FORMAT" };
  if (str.length % 4 !== 0) return { valid: false, message: "Invalid base64 length", code: "BASE64_LENGTH" };
  return { valid: true };
}

export function isValidBase64(str: string): boolean {
  return validateBase64(str).valid;
}

export function validateMimeType(mime: string): ValidationResult {
  const regex = /^[a-z]+\/[a-z0-9.+-]+$/i;
  if (!regex.test(mime)) return { valid: false, message: "Invalid MIME type", code: "MIME_FORMAT" };
  return { valid: true };
}

export function isValidMimeType(mime: string): boolean {
  return validateMimeType(mime).valid;
}

export function validateDomain(domain: string): ValidationResult {
  if (!domain) return { valid: false, message: "Domain is required", code: "DOMAIN_REQUIRED" };
  if (domain.length > 253) return { valid: false, message: "Domain too long", code: "DOMAIN_LONG" };
  const regex = /^(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i;
  if (!regex.test(domain)) return { valid: false, message: "Invalid domain format", code: "DOMAIN_FORMAT" };
  const labels = domain.split(".");
  for (const label of labels) {
    if (label.length > 63) return { valid: false, message: "Label too long", code: "DOMAIN_LABEL_LONG" };
    if (label.startsWith("-") || label.endsWith("-")) return { valid: false, message: "Label starts/ends with hyphen", code: "DOMAIN_HYPHEN" };
  }
  return { valid: true };
}

export function isValidDomain(domain: string): boolean {
  return validateDomain(domain).valid;
}

export function validateMIMEType(mime: string): boolean {
  return validateMimeType(mime).valid;
}

export function validatePort(port: number): ValidationResult {
  if (!Number.isInteger(port)) return { valid: false, message: "Port must be integer", code: "PORT_INT" };
  if (port < 0) return { valid: false, message: "Port below 0", code: "PORT_LOW" };
  if (port > 65535) return { valid: false, message: "Port above 65535", code: "PORT_HIGH" };
  return { valid: true };
}

export function isValidPort(port: number): boolean {
  return validatePort(port).valid;
}

export function validateColor(color: string): ValidationResult {
  if (validateHexColor(color).valid) return { valid: true, code: "hex" };
  if (validateRGB(color).valid) return { valid: true, code: "rgb" };
  if (validateRGBA(color).valid) return { valid: true, code: "rgba" };
  if (validateHSL(color).valid) return { valid: true, code: "hsl" };
  return { valid: false, message: "Invalid color format", code: "COLOR_INVALID" };
}

export function isValidColor(color: string): boolean {
  return validateColor(color).valid;
}

export function validateLength(value: string, min: number, max: number): ValidationResult {
  if (value.length < min) return { valid: false, message: `Must be at least ${min} characters`, code: "LENGTH_MIN" };
  if (value.length > max) return { valid: false, message: `Must be at most ${max} characters`, code: "LENGTH_MAX" };
  return { valid: true };
}

export function validateRange(value: number, min: number, max: number): ValidationResult {
  if (value < min) return { valid: false, message: `Must be at least ${min}`, code: "RANGE_MIN" };
  if (value > max) return { valid: false, message: `Must be at most ${max}`, code: "RANGE_MAX" };
  return { valid: true };
}

export function validatePattern(value: string, pattern: RegExp, message: string = "Invalid format"): ValidationResult {
  if (!pattern.test(value)) return { valid: false, message, code: "PATTERN_MISMATCH" };
  return { valid: true };
}

export function validateRequired(value: unknown, field: string = "Field"): ValidationResult {
  if (value === null || value === undefined || value === "") return { valid: false, message: `${field} is required`, code: "REQUIRED" };
  return { valid: true };
}

export function validateOptional(value: unknown, validator: (value: string) => ValidationResult): ValidationResult {
  if (value === null || value === undefined || value === "") return { valid: true };
  return validator(String(value));
}

export function validateEnum<T extends string>(value: string, enumValues: readonly T[]): ValidationResult {
  if (!enumValues.includes(value as T)) return { valid: false, message: `Must be one of: ${enumValues.join(", ")}`, code: "ENUM_INVALID" };
  return { valid: true };
}

export function validateOneOf<T>(value: T, validValues: readonly T[]): ValidationResult {
  if (!validValues.includes(value)) return { valid: false, message: `Must be one of: ${validValues.join(", ")}`, code: "ONE_OF_INVALID" };
  return { valid: true };
}

export function validateAll(values: Array<() => ValidationResult>): ValidationResult[] {
  return values.map((validator) => validator());
}

export function validateAny(values: Array<() => ValidationResult>): ValidationResult {
  const results = values.map((validator) => validator());
  const valid = results.find((r) => r.valid);
  return valid ?? results[0];
}

export function validateAllFields(obj: Record<string, unknown>, validators: Record<string, (value: unknown) => ValidationResult>): Array<{ field: string; result: ValidationResult }> {
  const results: Array<{ field: string; result: ValidationResult }> = [];
  for (const [field, validator] of Object.entries(validators)) {
    const result = validator(obj[field]);
    if (!result.valid) results.push({ field, result });
  }
  return results;
}

export function validateSchema(data: unknown, schema: Record<string, { type: string; required?: boolean; min?: number; max?: number; pattern?: RegExp; enum?: readonly string[]; default?: unknown }>): { valid: boolean; errors: Array<{ field: string; message: string }> } {
  const errors: Array<{ field: string; message: string }> = [];
  if (typeof data !== "object" || data === null) {
    return { valid: false, errors: [{ field: "_root", message: "Data must be an object" }] };
  }
  const obj = data as Record<string, unknown>;
  for (const [field, rules] of Object.entries(schema)) {
    if (!(field in obj)) {
      if (rules.required) errors.push({ field, message: `${field} is required` });
      else if (rules.default !== undefined) obj[field] = rules.default;
      continue;
    }
    const value = obj[field];
    if (rules.type === "string" && typeof value !== "string") errors.push({ field, message: `${field} must be a string` });
    if (rules.type === "number" && typeof value !== "number") errors.push({ field, message: `${field} must be a number` });
    if (rules.type === "boolean" && typeof value !== "boolean") errors.push({ field, message: `${field} must be a boolean` });
    if (rules.type === "array" && !Array.isArray(value)) errors.push({ field, message: `${field} must be an array` });
    if (rules.type === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) errors.push({ field, message: `${field} must be an object` });
    if (typeof value === "string") {
      if (rules.min !== undefined && value.length < rules.min) errors.push({ field, message: `${field} must be at least ${rules.min} characters` });
      if (rules.max !== undefined && value.length > rules.max) errors.push({ field, message: `${field} must be at most ${rules.max} characters` });
      if (rules.pattern && !rules.pattern.test(value)) errors.push({ field, message: `${field} has invalid format` });
    }
    if (typeof value === "number") {
      if (rules.min !== undefined && value < rules.min) errors.push({ field, message: `${field} must be at least ${rules.min}` });
      if (rules.max !== undefined && value > rules.max) errors.push({ field, message: `${field} must be at most ${rules.max}` });
    }
    if (rules.enum && typeof value === "string" && !rules.enum.includes(value)) errors.push({ field, message: `${field} must be one of: ${rules.enum.join(", ")}` });
  }
  return { valid: errors.length === 0, errors };
}

export function createValidator(rules: Record<string, (value: unknown) => ValidationResult>): (data: Record<string, unknown>) => { valid: boolean; errors: Array<{ field: string; message: string }> } {
  return (data: Record<string, unknown>) => {
    const errors: Array<{ field: string; message: string }> = [];
    for (const [field, validator] of Object.entries(rules)) {
      const result = validator(data[field]);
      if (!result.valid) errors.push({ field, message: result.message ?? "Invalid" });
    }
    return { valid: errors.length === 0, errors };
  };
}

export function combineValidators(...validators: Array<(value: string) => ValidationResult>): (value: string) => ValidationResult {
  return (value: string) => {
    for (const validator of validators) {
      const result = validator(value);
      if (!result.valid) return result;
    }
    return { valid: true };
  };
}

export function validateFileExtension(filename: string, allowed: string[]): ValidationResult {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.includes(ext)) return { valid: false, message: `File type .${ext} not allowed`, code: "FILE_EXT" };
  return { valid: true };
}

export function validateFileSize(size: number, maxSize: number): ValidationResult {
  if (size > maxSize) return { valid: false, message: `File too large (max ${maxSize} bytes)`, code: "FILE_SIZE" };
  return { valid: true };
}

export function validateFileType(mime: string, allowed: string[]): ValidationResult {
  if (!allowed.includes(mime)) return { valid: false, message: `File type ${mime} not allowed`, code: "FILE_TYPE" };
  return { valid: true };
}

export function validateImageType(mime: string): ValidationResult {
  return validateFileType(mime, ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp", "image/tiff"]);
}

export function validateDocumentType(mime: string): ValidationResult {
  return validateFileType(mime, ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv"]);
}

export function validateVideoType(mime: string): ValidationResult {
  return validateFileType(mime, ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-ms-wmv", "video/mpeg"]);
}

export function validateAudioType(mime: string): ValidationResult {
  return validateFileType(mime, ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac", "audio/flac", "audio/webm"]);
}

export function validateArchiveType(mime: string): ValidationResult {
  return validateFileType(mime, ["application/zip", "application/x-zip-compressed", "application/x-rar-compressed", "application/x-7z-compressed", "application/x-tar", "application/gzip"]);
}

export function validateArchiveExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"]);
}

export function validateImageExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff", "ico"]);
}

export function validateVideoExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["mp4", "webm", "ogg", "mov", "avi", "wmv", "mpeg", "mpg"]);
}

export function validateAudioExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["mp3", "wav", "ogg", "aac", "flac", "m4a", "webm"]);
}

export function validateDocumentExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "rtf"]);
}

export function validateCodeExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["ts", "js", "jsx", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp", "cs", "php", "swift", "kt", "scala", "lua", "r", "sh", "bat", "ps1", "sql", "html", "css", "scss", "less", "json", "yaml", "yml", "xml", "toml", "ini", "md"]);
}

export function validateFontExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["woff", "woff2", "ttf", "eot", "otf"]);
}

export function validateModelExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["gltf", "glb", "obj", "fbx", "stl", "dae", "3ds", "ply"]);
}

export function validateDataExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["json", "csv", "tsv", "xml", "yaml", "yml", "toml", "ini", "env"]);
}

export function validateConfigExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["json", "yaml", "yml", "toml", "ini", "env", "conf", "config"]);
}

export function validateCertificateExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["pem", "crt", "cer", "der", "pfx", "p12", "key"]);
}

export function validateKeyExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["pem", "key", "p12", "pfx", "jks", "keystore"]);
}

export function validateBackupExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["bak", "backup", "old", "orig", "tmp", "swp", "save"]);
}

export function validateLogExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["log", "out", "err"]);
}

export function validateDatabaseExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["db", "sqlite", "sqlite3", "sql", "dump", "backup"]);
}

export function validateExecutableExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["exe", "app", "bin", "cmd", "com", "bat", "sh", "msi", "deb", "rpm", "dmg", "pkg", "apk", "ipa"]);
}

export function isExecutableFile(filename: string): boolean {
  return validateExecutableExtension(filename).valid;
}

export function validateScriptExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["sh", "bash", "zsh", "fish", "ps1", "bat", "cmd", "vbs", "ahk", "applescript"]);
}

export function validateMarkupExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["html", "htm", "xhtml", "xml", "svg", "md", "rst", "tex", "adoc"]);
}

export function validateStylesheetExtension(filename: string): ValidationResult {
  return validateFileExtension(filename, ["css", "scss", "sass", "less", "styl", "pcss", "postcss"]);
}

export function validateAllExtensions(filename: string): ValidationResult {
  const validators = [validateImageExtension, validateVideoExtension, validateAudioExtension, validateDocumentExtension, validateCodeExtension, validateFontExtension, validateArchiveExtension, validateDataExtension, validateConfigExtension, validateCertificateExtension, validateKeyExtension, validateBackupExtension, validateLogExtension, validateDatabaseExtension, validateExecutableExtension, validateScriptExtension, validateMarkupExtension, validateStylesheetExtension, validateModelExtension];
  for (const validator of validators) {
    const result = validator(filename);
    if (result.valid) return result;
  }
  return { valid: false, message: "Unknown file type", code: "FILE_UNKNOWN" };
}

export function getFileType(filename: string): string | null {
  const result = validateAllExtensions(filename);
  return result.code ?? null;
}

export function validatePath(path: string): ValidationResult {
  if (!path) return { valid: false, message: "Path is required", code: "PATH_REQUIRED" };
  if (path.includes("..")) return { valid: false, message: "Path traversal not allowed", code: "PATH_TRAVERSAL" };
  if (path.includes("\0")) return { valid: false, message: "Null byte in path", code: "PATH_NULL" };
  if (path.length > 4096) return { valid: false, message: "Path too long", code: "PATH_LONG" };
  return { valid: true };
}

export function validateFilePath(path: string): ValidationResult {
  const result = validatePath(path);
  if (!result.valid) return result;
  if (path.includes("//")) return { valid: false, message: "Double slash in path", code: "PATH_DOUBLE_SLASH" };
  return { valid: true };
}

export function validateDirPath(path: string): ValidationResult {
  const result = validatePath(path);
  if (!result.valid) return result;
  if (path.includes(".")) {
    const parts = path.split("/");
    for (const part of parts) {
      if (part.includes(".") && part !== "." && part !== "..") return { valid: false, message: "Directory path should not contain file extensions", code: "PATH_DIR_EXT" };
    }
  }
  return { valid: true };
}

export function validateFilename(filename: string): ValidationResult {
  if (!filename) return { valid: false, message: "Filename is required", code: "FILENAME_REQUIRED" };
  if (filename.length > 255) return { valid: false, message: "Filename too long", code: "FILENAME_LONG" };
  if (/[<>:"|?*\x00-\x1f]/.test(filename)) return { valid: false, message: "Filename contains invalid characters", code: "FILENAME_CHARS" };
  if (filename.startsWith(".")) return { valid: false, message: "Filename should not start with dot", code: "FILENAME_DOT" };
  if (filename.endsWith(".")) return { valid: false, message: "Filename should not end with dot", code: "FILENAME_DOT_END" };
  if (filename.includes("..")) return { valid: false, message: "Double dot in filename", code: "FILENAME_DOUBLE_DOT" };
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(filename)) return { valid: false, message: "Reserved filename", code: "FILENAME_RESERVED" };
  return { valid: true };
}

export function validateMimeTypeFromString(mime: string): ValidationResult {
  return validateMimeType(mime);
}

export function validateCharset(charset: string): ValidationResult {
  const valid = ["utf-8", "utf-16", "iso-8859-1", "iso-8859-15", "windows-1252", "ascii", "us-ascii", "latin1", "iso-8859-2", "iso-8859-3", "iso-8859-4", "iso-8859-5", "iso-8859-6", "iso-8859-7", "iso-8859-8", "iso-8859-9", "iso-8859-10", "iso-8859-13", "iso-8859-14", "iso-8859-16", "koi8-r", "koi8-u", "gb2312", "gbk", "gb18030", "big5", "euc-jp", "shift_jis", "euc-kr"];
  if (!valid.includes(charset.toLowerCase())) return { valid: false, message: "Invalid charset", code: "CHARSET_INVALID" };
  return { valid: true };
}

export function validateEncoding(encoding: string): ValidationResult {
  const valid = ["hex", "base64", "base64url", "utf8", "utf-8", "ascii", "latin1", "binary", "ucs2", "ucs-2", "utf16le", "utf-16le"];
  if (!valid.includes(encoding.toLowerCase())) return { valid: false, message: "Invalid encoding", code: "ENCODING_INVALID" };
  return { valid: true };
}

export function validateAlgorithm(algorithm: string): ValidationResult {
  const valid = ["md5", "sha1", "sha224", "sha256", "sha384", "sha512", "ripemd160", "sha3-224", "sha3-256", "sha3-384", "sha3-512"];
  if (!valid.includes(algorithm.toLowerCase())) return { valid: false, message: "Invalid algorithm", code: "ALGORITHM_INVALID" };
  return { valid: true };
}

export function validateCipher(cipher: string): ValidationResult {
  const valid = ["aes-128-cbc", "aes-192-cbc", "aes-256-cbc", "aes-128-ecb", "aes-192-ecb", "aes-256-ecb", "aes-128-gcm", "aes-192-gcm", "aes-256-gcm", "aes-128-ctr", "aes-192-ctr", "aes-256-ctr", "aes-128-cfb", "aes-192-cfb", "aes-256-cfb", "aes-128-ofb", "aes-192-ofb", "aes-256-ofb", "des-cbc", "des-ecb", "des-ede3", "des-ede3-cbc", "des-ede3-cfb", "des-ede3-ofb", "chacha20", "chacha20-poly1305"];
  if (!valid.includes(cipher.toLowerCase())) return { valid: false, message: "Invalid cipher", code: "CIPHER_INVALID" };
  return { valid: true };
}

export function validateHashFormat(hash: string): ValidationResult {
  if (!/^[0-9a-f]+$/i.test(hash)) return { valid: false, message: "Invalid hash format", code: "HASH_FORMAT" };
  const validLengths = [32, 40, 56, 64, 96, 128];
  if (!validLengths.includes(hash.length)) return { valid: false, message: "Invalid hash length", code: "HASH_LENGTH" };
  return { valid: true };
}

export function validateKeyFormat(key: string): ValidationResult {
  if (!/^[0-9a-f]+$/i.test(key)) return { valid: false, message: "Invalid key format", code: "KEY_FORMAT" };
  const validLengths = [32, 48, 64, 128, 256];
  if (!validLengths.includes(key.length)) return { valid: false, message: "Invalid key length", code: "KEY_LENGTH" };
  return { valid: true };
}

export function validateIVFormat(iv: string): ValidationResult {
  if (!/^[0-9a-f]+$/i.test(iv)) return { valid: false, message: "Invalid IV format", code: "IV_FORMAT" };
  const validLengths = [16, 24, 32];
  if (!validLengths.includes(iv.length)) return { valid: false, message: "Invalid IV length", code: "IV_LENGTH" };
  return { valid: true };
}

export function validateSaltFormat(salt: string): ValidationResult {
  if (!/^[0-9a-f]+$/i.test(salt)) return { valid: false, message: "Invalid salt format", code: "SALT_FORMAT" };
  return { valid: true };
}

export function validateTokenFormat(token: string): ValidationResult {
  if (!token) return { valid: false, message: "Token is required", code: "TOKEN_REQUIRED" };
  if (token.length < 8) return { valid: false, message: "Token too short", code: "TOKEN_SHORT" };
  if (!/^[a-zA-Z0-9._-]+$/.test(token)) return { valid: false, message: "Invalid token format", code: "TOKEN_FORMAT" };
  return { valid: true };
}

export function validateAPIKeyFormat(key: string): ValidationResult {
  if (!key) return { valid: false, message: "API key is required", code: "APIKEY_REQUIRED" };
  if (key.length < 16) return { valid: false, message: "API key too short", code: "APIKEY_SHORT" };
  if (key.length > 256) return { valid: false, message: "API key too long", code: "APIKEY_LONG" };
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) return { valid: false, message: "Invalid API key format", code: "APIKEY_FORMAT" };
  return { valid: true };
}

export function validateSecretFormat(secret: string): ValidationResult {
  if (!secret) return { valid: false, message: "Secret is required", code: "SECRET_REQUIRED" };
  if (secret.length < 16) return { valid: false, message: "Secret too short", code: "SECRET_SHORT" };
  if (secret.length > 1024) return { valid: false, message: "Secret too long", code: "SECRET_LONG" };
  return { valid: true };
}

export function validatePin(pin: string): ValidationResult {
  if (!pin) return { valid: false, message: "PIN is required", code: "PIN_REQUIRED" };
  if (!/^\d{4,8}$/.test(pin)) return { valid: false, message: "PIN must be 4-8 digits", code: "PIN_FORMAT" };
  if (/^(\d)\1+$/.test(pin)) return { valid: false, message: "PIN cannot be all same digits", code: "PIN_REPEATED" };
  if (/^(1234|2345|3456|4567|5678|6789|0123|1230)$/.test(pin)) return { valid: false, message: "PIN is too simple", code: "PIN_SIMPLE" };
  return { valid: true };
}

export function validateOTP(otp: string): ValidationResult {
  if (!otp) return { valid: false, message: "OTP is required", code: "OTP_REQUIRED" };
  if (!/^\d{4,10}$/.test(otp)) return { valid: false, message: "OTP must be 4-10 digits", code: "OTP_FORMAT" };
  return { valid: true };
}

export function validateTOTP(token: string): ValidationResult {
  if (!token) return { valid: false, message: "TOTP token is required", code: "TOTP_REQUIRED" };
  if (!/^\d{6}$/.test(token)) return { valid: false, message: "TOTP must be 6 digits", code: "TOTP_FORMAT" };
  return { valid: true };
}

export function validateBarcode(barcode: string): ValidationResult {
  if (!barcode) return { valid: false, message: "Barcode is required", code: "BARCODE_REQUIRED" };
  if (!/^\d{8,14}$/.test(barcode)) return { valid: false, message: "Barcode must be 8-14 digits", code: "BARCODE_FORMAT" };
  return { valid: true };
}

export function validateEAN(barcode: string): ValidationResult {
  if (!barcode) return { valid: false, message: "EAN is required", code: "EAN_REQUIRED" };
  if (barcode.length !== 13 && barcode.length !== 8) return { valid: false, message: "EAN must be 8 or 13 digits", code: "EAN_LENGTH" };
  if (!/^\d+$/.test(barcode)) return { valid: false, message: "EAN must be numeric", code: "EAN_NUMERIC" };
  let sum = 0;
  const len = barcode.length;
  for (let i = 0; i < len - 1; i++) {
    sum += parseInt(barcode[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const checksum = (10 - (sum % 10)) % 10;
  if (checksum !== parseInt(barcode[len - 1], 10)) return { valid: false, message: "EAN checksum failed", code: "EAN_CHECKSUM" };
  return { valid: true };
}

export function validateUPC(barcode: string): ValidationResult {
  if (!barcode) return { valid: false, message: "UPC is required", code: "UPC_REQUIRED" };
  if (barcode.length !== 12) return { valid: false, message: "UPC must be 12 digits", code: "UPC_LENGTH" };
  if (!/^\d+$/.test(barcode)) return { valid: false, message: "UPC must be numeric", code: "UPC_NUMERIC" };
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(barcode[i], 10) * (i % 2 === 0 ? 3 : 1);
  }
  const checksum = (10 - (sum % 10)) % 10;
  if (checksum !== parseInt(barcode[11], 10)) return { valid: false, message: "UPC checksum failed", code: "UPC_CHECKSUM" };
  return { valid: true };
}

export function validateVIN(vin: string): ValidationResult {
  if (!vin) return { valid: false, message: "VIN is required", code: "VIN_REQUIRED" };
  if (vin.length !== 17) return { valid: false, message: "VIN must be 17 characters", code: "VIN_LENGTH" };
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) return { valid: false, message: "Invalid VIN characters", code: "VIN_CHARS" };
  return { valid: true };
}

export function validateIBAN(iban: string): ValidationResult {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (!cleaned) return { valid: false, message: "IBAN is required", code: "IBAN_REQUIRED" };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned)) return { valid: false, message: "Invalid IBAN format", code: "IBAN_FORMAT" };
  const reordered = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = reordered.replace(/[A-Z]/g, (char) => String(char.charCodeAt(0) - 55));
  let remainder = "";
  for (const digit of numeric) {
    remainder += digit;
    const num = parseInt(remainder, 10);
    if (num >= 97) {
      remainder = String(num % 97);
    }
  }
  if (parseInt(remainder, 10) !== 1) return { valid: false, message: "IBAN checksum failed", code: "IBAN_CHECKSUM" };
  return { valid: true };
}

export function validateSWIFT(swift: string): ValidationResult {
  if (!swift) return { valid: false, message: "SWIFT is required", code: "SWIFT_REQUIRED" };
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(swift.toUpperCase())) return { valid: false, message: "Invalid SWIFT format", code: "SWIFT_FORMAT" };
  return { valid: true };
}

export function validateCurrency(currency: string): ValidationResult {
  const valid = ["USD", "EUR", "GBP", "JPY", "INR", "AUD", "CAD", "CHF", "CNY", "SEK", "NZD", "MXN", "SGD", "HKD", "NOK", "KRW", "TRY", "RUB", "BRL", "ZAR", "AED", "SAR", "THB", "IDR", "MYR", "PHP", "VND", "CZK", "DKK", "HUF", "PLN", "RON", "BGN", "HRK", "ISK", "ILS", "CLP", "COP", "PEN", "UYU", "EGP", "KES", "NGN", "MAD", "DZD", "TND", "PKR", "BDT", "LKR", "NPR", "MMK", "KHR", "LAK", "TWD", "KZT", "AZN", "GEL", "AMD", "BYN", "UAH", "MDL", "ALL", "BAM", "MKD", "RSD", "ETB", "GHS", "TZS", "UGX", "RWF", "XOF", "XAF", "XCD", "XPF", "XDR"];
  if (!valid.includes(currency.toUpperCase())) return { valid: false, message: "Invalid currency code", code: "CURRENCY_INVALID" };
  return { valid: true };
}

export function validateLanguageCode(code: string): ValidationResult {
  const regex = /^[a-z]{2}(-[A-Z]{2})?$/i;
  if (!regex.test(code)) return { valid: false, message: "Invalid language code", code: "LANG_FORMAT" };
  return { valid: true };
}

export function validateCountryCode(code: string): ValidationResult {
  const regex = /^[A-Z]{2}$/;
  if (!regex.test(code)) return { valid: false, message: "Invalid country code", code: "COUNTRY_FORMAT" };
  return { valid: true };
}

export function validateLocale(locale: string): ValidationResult {
  const regex = /^[a-z]{2}(-[A-Z]{2})?$/i;
  if (!regex.test(locale)) return { valid: false, message: "Invalid locale format", code: "LOCALE_FORMAT" };
  return { valid: true };
}

export function validateTimezone(timezone: string): ValidationResult {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return { valid: true };
  } catch {
    return { valid: false, message: "Invalid timezone", code: "TIMEZONE_INVALID" };
  }
}

export function validateCurrencyCode(code: string): boolean {
  return validateCurrency(code).valid;
}

export function validateLanguageCodeFormat(code: string): boolean {
  return validateLanguageCode(code).valid;
}

export function validateCountryCodeFormat(code: string): boolean {
  return validateCountryCode(code).valid;
}

export function validateLocaleFormat(locale: string): boolean {
  return validateLocale(locale).valid;
}

export function validateTimezoneFormat(timezone: string): boolean {
  return validateTimezone(timezone).valid;
}

export function validateHash(hash: string): boolean {
  return validateHashFormat(hash).valid;
}

export function validateKey(key: string): boolean {
  return validateKeyFormat(key).valid;
}

export function validateIV(iv: string): boolean {
  return validateIVFormat(iv).valid;
}

export function validateSalt(salt: string): boolean {
  return validateSaltFormat(salt).valid;
}

export function validateToken(token: string): boolean {
  return validateTokenFormat(token).valid;
}

export function validateAPIKey(key: string): boolean {
  return validateAPIKeyFormat(key).valid;
}

export function validateSecret(secret: string): boolean {
  return validateSecretFormat(secret).valid;
}

export function validateBarcodeFormat(barcode: string): boolean {
  return validateBarcode(barcode).valid;
}

export function validateEANFormat(barcode: string): boolean {
  return validateEAN(barcode).valid;
}

export function validateUPCFormat(barcode: string): boolean {
  return validateUPC(barcode).valid;
}

export function validateVINFormat(vin: string): boolean {
  return validateVIN(vin).valid;
}

export function validateIBANFormat(iban: string): boolean {
  return validateIBAN(iban).valid;
}

export function validateSWIFTFormat(swift: string): boolean {
  return validateSWIFT(swift).valid;
}

export function validateCurrencyFormat(currency: string): boolean {
  return validateCurrency(currency).valid;
}

export function validateLanguageCodeStrict(code: string): boolean {
  return validateLanguageCode(code).valid;
}

export function validateCountryCodeStrict(code: string): boolean {
  return validateCountryCode(code).valid;
}

export function validateLocaleStrict(locale: string): boolean {
  return validateLocale(locale).valid;
}

export function validateTimezoneStrict(timezone: string): boolean {
  return validateTimezone(timezone).valid;
}

export function validateHashStrict(hash: string): boolean {
  return validateHashFormat(hash).valid;
}

export function validateKeyStrict(key: string): boolean {
  return validateKeyFormat(key).valid;
}

export function validateIVStrict(iv: string): boolean {
  return validateIVFormat(iv).valid;
}

export function validateSaltStrict(salt: string): boolean {
  return validateSaltFormat(salt).valid;
}

export function validateTokenStrict(token: string): boolean {
  return validateTokenFormat(token).valid;
}

export function validateAPIKeyStrict(key: string): boolean {
  return validateAPIKeyFormat(key).valid;
}

export function validateSecretStrict(secret: string): boolean {
  return validateSecretFormat(secret).valid;
}
