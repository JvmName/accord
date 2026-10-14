const { jest } = require('bun:test');


/**
 * Fake-timer shim. `bun:test`'s `jest` compat object implements
 * `useFakeTimers` / `useRealTimers` / `setSystemTime` / `advanceTimersByTime`
 * with the same semantics Jest has, verified against bun 1.4.2:
 *   - `advanceTimersByTime(ms)` synchronously fires pending `setTimeout`s
 *     scheduled within the window.
 *   - `setSystemTime(date)` moves `Date.now()` / `new Date()`.
 * No clock arithmetic workaround is required.
 */
const Time = {
  setSystemTime: function (date) {
    this.useFakeTimers();
    jest.setSystemTime(date);
  },


  advanceTimers: function(ms) {
    jest.advanceTimersByTime(ms);
  },


  useFakeTimers: function() {
    jest.useFakeTimers();
  },


  useRealTimers: function() {
    jest.useRealTimers();
  }
}


module.exports = {
  Time
}
