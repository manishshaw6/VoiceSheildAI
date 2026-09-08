/**
 * VoxShield AI — Error Contract
 * Standardized API error model. Internal details never leak to clients.
 */

import { ErrorCode } from '../core/constants.js';

/**
 * Application-level error with a code, HTTP status, and safe client message.
 * Internal details (stack traces, provider errors) are logged but never sent to clients.
 */
export class ApiError extends Error {
  /**
   * @param {string} code - ErrorCode enum value
   * @param {string} message - Safe, client-facing message
   * @param {number} [status=500] - HTTP status code
   * @param {object} [details=null] - Internal details for logging (never sent to client)
   */
  constructor(code, message, status = 500, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code || ErrorCode.INTERNAL_ERROR;
    this.status = status;
    this.details = details; // internal only, for structured logging
  }

  /**
   * Format this error for HTTP response.
   * @param {string} [requestId] - Request correlation ID
   * @returns {object}
   */
  toResponse(requestId = null) {
    const response = {
      error: {
        code: this.code,
        message: this.message
      }
    };
    if (requestId) {
      response.error.request_id = requestId;
    }
    return response;
  }
}

// ─── Pre-built Error Factories ──────────────────────────────────────────────

export function audioMissingError() {
  return new ApiError(
    ErrorCode.AUDIO_MISSING,
    'No audio file provided. Supported formats: WAV, MP3, M4A, WEBM, OGG.',
    400
  );
}

export function audioEmptyError() {
  return new ApiError(
    ErrorCode.AUDIO_EMPTY,
    'Uploaded audio file is empty (0 bytes).',
    400
  );
}

export function audioUnsupportedError(detail) {
  return new ApiError(
    ErrorCode.AUDIO_UNSUPPORTED,
    detail || 'Unsupported audio format.',
    400
  );
}

export function audioUnusableError(warnings) {
  return new ApiError(
    ErrorCode.AUDIO_UNUSABLE,
    'Audio quality is too low for reliable analysis.',
    422,
    { warnings }
  );
}

export function audioTooShortError(duration) {
  return new ApiError(
    ErrorCode.AUDIO_TOO_SHORT,
    `Audio is too short for analysis (${duration}s). Minimum ${0.5}s required.`,
    422,
    { duration }
  );
}

export function validationError(message) {
  return new ApiError(
    ErrorCode.VALIDATION_FAILED,
    message,
    400
  );
}

export function missingParameterError(paramName) {
  return new ApiError(
    ErrorCode.MISSING_PARAMETER,
    `Required parameter '${paramName}' is missing.`,
    400
  );
}

export function notFoundError(resource) {
  return new ApiError(
    ErrorCode.NOT_FOUND,
    `${resource} not found.`,
    404
  );
}

export function providerUnavailableError(provider) {
  return new ApiError(
    ErrorCode.PROVIDER_UNAVAILABLE,
    `Analysis provider '${provider}' is currently unavailable.`,
    503,
    { provider }
  );
}

export function providerTimeoutError(provider) {
  return new ApiError(
    ErrorCode.PROVIDER_TIMEOUT,
    `Analysis provider '${provider}' timed out.`,
    504,
    { provider }
  );
}

export function rateLimitedError() {
  return new ApiError(
    ErrorCode.RATE_LIMITED,
    'Too many requests. Please try again later.',
    429
  );
}

export function internalError(internalDetails = null) {
  return new ApiError(
    ErrorCode.INTERNAL_ERROR,
    'An internal error occurred. Please try again later.',
    500,
    internalDetails
  );
}

/**
 * Formats any error (ApiError or generic Error) into a safe client response.
 * @param {Error} err
 * @param {string} [requestId]
 * @returns {{ status: number, body: object }}
 */
export function formatErrorResponse(err, requestId = null) {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      body: err.toResponse(requestId)
    };
  }

  // Generic error — never expose internals
  return {
    status: 500,
    body: {
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An internal error occurred.',
        ...(requestId ? { request_id: requestId } : {})
      }
    }
  };
}
