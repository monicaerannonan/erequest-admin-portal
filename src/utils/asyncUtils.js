/**
 * Async utility functions for resilient network requests and timeouts.
 */

/**
 * Wraps a promise with a timeout rejection to prevent UI state from hanging indefinitely.
 * @param {Promise} promise - The promise to execute.
 * @param {number} timeoutMs - Timeout duration in milliseconds (default: 10000ms).
 * @param {string} context - Descriptive name for logging / error context.
 * @returns {Promise}
 */
export function withTimeout(promise, timeoutMs = 10000, context = "Operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${context} timed out after ${timeoutMs}ms. Please check your network connection.`));
      }, timeoutMs);

      // Clean up timer if the original promise resolves first
      if (typeof promise?.finally === "function") {
        promise.finally(() => clearTimeout(timer));
      }
    })
  ]);
}
