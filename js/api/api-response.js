/* Minimal response guards for future UI integrations. */
(function () {
  'use strict';
  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  }
  window.NIL_API_RESPONSE = Object.freeze({
    isPlainObject,
    hasString(value, key, max) {
      return isPlainObject(value) && typeof value[key] === 'string' && value[key].length <= (max || 10000);
    }
  });
})();
