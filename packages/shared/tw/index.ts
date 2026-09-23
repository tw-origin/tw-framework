
import { sha256 } from "./hashing/sha";

export { ObjectUtils, createObjectUtils } from "./utils";
export type { ObjectUtilsConfig } from "./utils";
export { createDefaultConfig, findConfig, isValidConfig, loadConfig, loadConfigSync, mergeConfig, resolveEnvVars, serializeConfig, toPublicConfig, validateConfig } from "./config";
export type { BuildConfig, CORSConfig, CSSConfig, CacheConfig, CompilerConfig, DevConfig, HeaderRule, I18nConfig, PluginConfigEntry, RedirectRule, RewriteRule, RouteEntry, RouterConfig, SSLConfig, SecurityConfig, ServerConfig, TwConfig } from "./config";
export { BUILTIN_CACHE_PROFILES, cacheMetaIsUsable, canonicalizeQuery, extractCacheDirective, parseCacheBody, parseCacheProfilesSource, readCacheProfilesSync, resolveCache } from "./cache";
export { maskSourceStringsAndComments } from "./source-mask";
export type { CacheDirectiveMeta, CacheProfile, ResolvedCache } from "./cache";
export { ARIA_ATTRIBUTES, ARIA_ROLES, BOOLEAN_ATTRS, CSP_DIRECTIVES, CSS_ALIASES, CSS_AT_RULES, CSS_FUNCTIONS, CSS_LENGTH_UNITS, CSS_MEDIA_FEATURES, CSS_PROPERTIES, CSS_PSEUDO_CLASSES, CSS_PSEUDO_ELEMENTS, EVENT_HANDLER_ATTRS, EVENT_TYPES, FILE_CONVENTIONS, FOREIGN_ELEMENTS, GLOBAL_ATTRIBUTES, HTML_ATTRIBUTES, HTML_ELEMENTS, HTTP_METHODS, HTTP_STATUS_CODES, JS_RESERVED, MIME_TYPES, NUMERIC_CSS, PERF_MARKS, RAW_TEXT_TAGS, RENDER_MODES, REVALIDATE_MODES, ROUTER_KEYS, TEMPLATE_TAGS, VLQ_BASE, VLQ_BASE64_CHARS, VLQ_BASE_MASK, VLQ_BASE_SHIFT, VLQ_CONTINUATION_BIT, VOID_TAGS } from "./constants";
export { CryptoManager, atbash, base64Decode, base64Encode, base64UrlDecode, base64UrlEncode, caesarCipher, compareBuffers, compareFiles, compareHashes, constantTimeCompare, createCryptoManager, decryptAES, decryptRSA, decryptString, deriveKey, digest, djb2Hash, encryptAES, encryptRSA, encryptString, fnv1aHash, generateApiKey, generateChallenge, generateNonce, generateOTP, generatePIN, generateProofOfKnowledge, generateRSAKeyPair, generateSecret, generateTOTP, getSupportedAlgorithms, getSupportedHashAlgorithms, getSupportedKeyLengths, hashFile, hashObject, hashPassword, hashSimple, hashStream, hashString, hashWithWebCrypto, hexDecode, hexEncode, hmac, isCryptoAvailable, maskApiKey, maskCreditCard, maskEmail, maskPhone, maskSSN, maskSensitiveData, md5 as md5Async, murmurhash3, pbkdf2, randomBase64, randomBytes, randomHex, randomInt, randomSalt, randomString, randomToken, randomUUID, rot13, sanitizeForAPIKey, sanitizeForAbbeNumber, sanitizeForAbsorptance, sanitizeForAbsorptionCoefficient, sanitizeForAdmittance, sanitizeForAlbedo, sanitizeForAlgorithm, sanitizeForAltitude, sanitizeForAmplitude, sanitizeForAngle, sanitizeForAngularAcceleration, sanitizeForAngularFrequency, sanitizeForAngularMomentum, sanitizeForAngularVelocity, sanitizeForAperture, sanitizeForArea, sanitizeForAttenuationCoefficient, sanitizeForAttribute, sanitizeForAzimuth, sanitizeForBandwidth, sanitizeForBarcode, sanitizeForBase64, sanitizeForBase64Input, sanitizeForBearing, sanitizeForBel, sanitizeForBinary, sanitizeForBinaryInput, sanitizeForBitrate, sanitizeForBohrMagneton, sanitizeForBoolean, sanitizeForBooleanInput, sanitizeForCSS, sanitizeForCapacitance, sanitizeForCapacitanceValue, sanitizeForCharset, sanitizeForCipher, sanitizeForCoherence, sanitizeForColor, sanitizeForCommand, sanitizeForCompass, sanitizeForConcentration, sanitizeForConductance, sanitizeForConductivity, sanitizeForControllability, sanitizeForConvolution, sanitizeForCookie, sanitizeForCoordinates, sanitizeForCorrelation, sanitizeForCountryCode, sanitizeForCreditCard, sanitizeForCurrency, sanitizeForCurrent, sanitizeForCutoffFrequency, sanitizeForDampedFrequency, sanitizeForDampingCoefficient, sanitizeForDampingRatio, sanitizeForDataRate, sanitizeForDataSize, sanitizeForDataURI, sanitizeForDate, sanitizeForDateInput, sanitizeForDateTime, sanitizeForDecade, sanitizeForDecibel, sanitizeForDecimal, sanitizeForDeclination, sanitizeForDensity, sanitizeForDetectability, sanitizeForDetectability2, sanitizeForDiffraction, sanitizeForDip, sanitizeForDirection, sanitizeForDispersion, sanitizeForDisplay, sanitizeForDistance, sanitizeForDomain, sanitizeForDuration, sanitizeForEAN, sanitizeForElectricCharge, sanitizeForElectricField, sanitizeForElectricFlux, sanitizeForElectricPotential, sanitizeForElevation, sanitizeForEmail, sanitizeForEmissivity, sanitizeForEncoding, sanitizeForEnergy, sanitizeForEntropy, sanitizeForExtinctionCoefficient, sanitizeForFNumber, sanitizeForFilename, sanitizeForFloat, sanitizeForFloatInput, sanitizeForFocalLength, sanitizeForForce, sanitizeForFourierTransform, sanitizeForFraction, sanitizeForFrequency, sanitizeForFrequencyAngular, sanitizeForFrequencyHz, sanitizeForFrequencyResponse, sanitizeForGForce, sanitizeForGroupVelocity, sanitizeForHSL, sanitizeForHTML, sanitizeForHash, sanitizeForHeader, sanitizeForHeading, sanitizeForHeat, sanitizeForHex, sanitizeForHexColor, sanitizeForHexInput, sanitizeForIBAN, sanitizeForIPAddress, sanitizeForIPv4, sanitizeForIPv6, sanitizeForISBN, sanitizeForIV, sanitizeForIlluminance, sanitizeForImpedance, sanitizeForImpedanceMatching, sanitizeForImpulse, sanitizeForImpulseResponse, sanitizeForInclination, sanitizeForInductance, sanitizeForInsertionLoss, sanitizeForInteger, sanitizeForIntegerInput, sanitizeForInterference, sanitizeForInterval, sanitizeForIrradiance, sanitizeForJS, sanitizeForJSON, sanitizeForJSONInput, sanitizeForJWT, sanitizeForJavaScript, sanitizeForKey, sanitizeForLDAP, sanitizeForLanguageCode, sanitizeForLaplaceTransform, sanitizeForLatitude, sanitizeForLocale, sanitizeForLog, sanitizeForLongitude, sanitizeForLuminance, sanitizeForLuminousDensity, sanitizeForLuminousEfficacy, sanitizeForLuminousEmittance, sanitizeForLuminousEnergy, sanitizeForLuminousExitance, sanitizeForLuminousExposure, sanitizeForLuminousFlux, sanitizeForLuminousIntensity, sanitizeForMAC, sanitizeForMagneticDipoleMoment, sanitizeForMagneticField, sanitizeForMagneticFlux, sanitizeForMagneticFluxDensity, sanitizeForMagneticMoment, sanitizeForMassFraction, sanitizeForMimeType, sanitizeForMolality, sanitizeForMolarConcentration, sanitizeForMolarMass, sanitizeForMolarVolume, sanitizeForMoleFraction, sanitizeForMomentum, sanitizeForNaturalFrequency, sanitizeForNeper, sanitizeForNoSQL, sanitizeForNuclearMagnetron, sanitizeForNumber, sanitizeForNumberInput, sanitizeForNumericalAperture, sanitizeForOTP, sanitizeForObservability, sanitizeForOctave, sanitizeForOpacity, sanitizeForOpticalDepth, sanitizeForPH, sanitizeForPIN, sanitizeForParabolicResponse, sanitizeForPassBand, sanitizeForPassword, sanitizeForPath, sanitizeForPercentage, sanitizeForPeriod, sanitizeForPermeability, sanitizeForPermeance, sanitizeForPermittivity, sanitizeForPhase, sanitizeForPhaseShift, sanitizeForPhaseVelocity, sanitizeForPhone, sanitizeForPitch, sanitizeForPolarization, sanitizeForPort, sanitizeForPower, sanitizeForPressure, sanitizeForProportion, sanitizeForQualityFactor, sanitizeForRGB, sanitizeForRGBA, sanitizeForRPM, sanitizeForRadiance, sanitizeForRadiantEmittance, sanitizeForRadiantEnergy, sanitizeForRadiantExposure, sanitizeForRadiantFlux, sanitizeForRadiantIntensity, sanitizeForRampResponse, sanitizeForRatio, sanitizeForReachability, sanitizeForReactance, sanitizeForReflectance, sanitizeForReflection, sanitizeForReflectionCoefficient, sanitizeForRefraction, sanitizeForRefractiveIndex, sanitizeForRegex, sanitizeForReluctance, sanitizeForResistance, sanitizeForResistivity, sanitizeForResonantFrequency, sanitizeForReturnLoss, sanitizeForRoll, sanitizeForSQL, sanitizeForSSN, sanitizeForSWIFT, sanitizeForSalt, sanitizeForScatteringCoefficient, sanitizeForScientific, sanitizeForSecret, sanitizeForSemver, sanitizeForShell, sanitizeForSolidAngle, sanitizeForSpecificGravity, sanitizeForSpecificHeat, sanitizeForSpecificVolume, sanitizeForSpectralEnergy, sanitizeForSpectralExitance, sanitizeForSpectralIntensity, sanitizeForSpectralIrradiance, sanitizeForSpectralPower, sanitizeForSpectralRadiance, sanitizeForSpeed, sanitizeForStability, sanitizeForStabilizability, sanitizeForStandingWaveRatio, sanitizeForStepResponse, sanitizeForStopBand, sanitizeForSusceptance, sanitizeForTOTP, sanitizeForTemperature, sanitizeForTemplate, sanitizeForThermalConductivity, sanitizeForThermalExpansion, sanitizeForTime, sanitizeForTimeInput, sanitizeForTimestamp, sanitizeForTimezone, sanitizeForToken, sanitizeForTorque, sanitizeForTransferFunction, sanitizeForTransmissionCoefficient, sanitizeForTransmittance, sanitizeForUPC, sanitizeForURL, sanitizeForURLInput, sanitizeForUUID, sanitizeForVIN, sanitizeForVSWR, sanitizeForViscosity, sanitizeForVoltage, sanitizeForVolume, sanitizeForVolumeFraction, sanitizeForWatts, sanitizeForWaveImpedance, sanitizeForWaveNumber, sanitizeForWaveVector, sanitizeForWavelength, sanitizeForWavenumber, sanitizeForWeight, sanitizeForWork, sanitizeForXML, sanitizeForXPath, sanitizeForYaw, sanitizeForZTransform, sanitizeForZipCode, sanitizeInput, sdbmHash, sha1, sha256Buffer, sha256File, sha384, sha512, signData, timingSafeEqual, utf8Decode, utf8Encode, verifyPassword, verifyProofOfKnowledge, verifySignature, verifyTOTP, vigenereDecrypt, vigenereEncrypt, xorStrings } from "./crypto";
export type { EncryptionOptions, HashAlgorithm, HashOptions, KeyDerivationOptions } from "./crypto";
export { detectArch, detectPlatform, detectRuntime, getEnvBool, getEnvNumber, getEnvVar, getEnvironmentInfo, isDevelopment, isProduction, isTest, supportsColor, supportsFileSystem, supportsWebSocket } from "./env";
export type { Arch, EnvironmentInfo, Platform, Runtime } from "./env";
export { FileLock, atomicWrite, atomicWriteSync, chmodSync, copyDir, copyDirSync, copyFileSync, existsSync, fileSizeStr, getMimeType, globMatch, globSync, isBinary, mkdirSync, mkdirp, readFileBytes, readFileSync, readJSON, readJSONSync, readOr, readOrSync, readdirSync, removeSync, renameSync, statSync, tempFile, tempFileSync, walk, walkSync, watch, writeFileSync, writeJSON, writeJSONSync } from "./fs";
export type { WalkOptions, WatchEvent, WatchOptions } from "./fs";
export { HASH_INFO, buildMerkleTree, compareETags, computeETag, computeETagStrong, computeETagWeak, contentHash, crc32, fingerprint, hash, hashSync, md5, sha256, sha256Async, shortHash, uuid, uuidV4, uuidV7, verifyHmac, verifyMerkleProof } from "./hashing";
export type { Fingerprint, MerkleNode } from "./hashing";
export { ANSI, LEVEL_COLORS, LEVEL_ICONS, LOG_LEVEL_NAMES, LogLevel, Logger, ProgressBar, createConsoleTransport, createFileTransport, createMemoryTransport, createRemoteTransport, getLogger, printTable, resetLogger, setLogger } from "./logger";
export type { LogEntry, LogTransport } from "./logger";
export { ROUTE_EXTENSIONS, SPECIAL_FILES, TSS_EXTENSION, TWM_EXTENSION, TWM_FILE_TYPES, TW_EXTENSION, TW_FILE_TYPES, VALID_RENDER_MODES, extractGroupName, extractSlotName, getExtensionForType, getRouteFileType, isApiRoute, isDynamicFolder, isInteractiveFile, isInterceptingFolder, isMiddlewareFile, isParallelSlot, isPrivateFolder, isRouteGroup, parseInterceptingFolder, parseSegment } from "./routing";
export type { CompiledFileEntry, ParsedSegment, RenderMode, RenderPipelineOptions, RouteFile, RouteFileType, RouteMatchResult, RouteNode, RouteRenderResult, SegmentKind } from "./routing";
export { CompileError, ConfigurationError, ParseError, RuntimeError, TWError, TypeError_, ValidationError, andThen, asyncOk, err, isErr, isError, isNone, isOk, isSome, isTWError, map, mapErr, ok, toTWError, unwrap, unwrapOr, unwrapOrElse } from "./types";
export type { AsyncResult, Brand, Cloneable, Comparable, DeepPartial, DeepReadonly, Disposable, Equatable, Maybe, Result, Tagged } from "./types";

export { uuidv4 } from "./utils/string/transform";
// Stubs for missing shared utilities (used by tests)
export function generateETag(data: string): string {
  // Simple hash-based ETag
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const ch = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return '"' + Math.abs(hash).toString(16) + '"';
}

export function merkleRoot(hashes: string[]): string {
  if (hashes.length === 0) return "";
  if (hashes.length === 1) return sha256(hashes[0]);
  let level = hashes.map((h) => sha256(h));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(sha256(left + right));
    }
    level = next;
  }
  return level[0];
}

export function hmacSign(data: string, key: string): string {
  // Simple HMAC-like signature (not cryptographically secure)
  let h1 = 0, h2 = 0;
  for (let i = 0; i < data.length; i++) {
    h1 = ((h1 << 5) - h1) + data.charCodeAt(i);
    h1 |= 0;
  }
  for (let i = 0; i < key.length; i++) {
    h2 = ((h2 << 5) - h2) + key.charCodeAt(i);
    h2 |= 0;
  }
  return (h1 ^ h2).toString(16);
}

export function hmacVerify(data: string, key: string, signature: string): boolean {
  return hmacSign(data, key) === signature;
}

export const HTML_TAGS = new Set([
  "html", "head", "body", "div", "span", "p", "a", "img", "ul", "ol", "li",
  "table", "tr", "td", "th", "thead", "tbody", "tfoot", "form", "input",
  "button", "select", "option", "textarea", "label", "fieldset", "legend",
  "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr", "meta", "link", "title",
  "style", "script", "noscript", "template", "slot", "header", "footer",
  "nav", "main", "section", "article", "aside", "figure", "figcaption",
  "details", "summary", "mark", "time", "progress", "meter", "dialog",
  "canvas", "svg", "video", "audio", "source", "track", "iframe", "embed",
  "object", "param", "picture", "col", "colgroup", "caption", "address",
  "blockquote", "pre", "code", "kbd", "samp", "var", "sub", "sup",
  "small", "strong", "em", "b", "i", "u", "s", "del", "ins", "abbr",
  "cite", "q", "dfn", "dl", "dt", "dd", "area", "map", "base", "wbr",
]);

