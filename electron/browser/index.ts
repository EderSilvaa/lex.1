/**
 * Browser utilities — barrel exports
 *
 * Post-action validation, selector memory, discovery, and resolution.
 */

export { captureDOMSnapshot, computeValidation } from './validation';
export type { DOMSnapshot, ValidationResult } from './validation';

export { initSelectorMemory, lookupSelectors, recordSuccess, recordFailure, flush as flushSelectorMemory, getStats as getSelectorStats } from './selector-memory';
export type { SelectorAnalytics } from './selector-memory';

export { discoverSelector } from './selector-discovery';
export type { DiscoveryCandidate } from './selector-discovery';

export { resolveSelector, confirmResolved } from './resolve-selector';
export type { ResolvedSelector } from './resolve-selector';

export { detectCaptcha, solveCaptchaWithVision, screenshotCaptchaImage, htmlHasCaptcha } from './captcha';
export type { CaptchaDetection, CaptchaSolveResult } from './captcha';
