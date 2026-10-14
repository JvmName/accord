const { jest } = require('bun:test');


/**
 * `spyOn(target, prop, 'get')` replacement.
 *
 * bun 1.4.2 rejects accessor spies outright:
 *   "spyOn(target, prop) does not support accessor properties yet".
 *
 * This installs a mock function as the property's getter and returns it, so the
 * call sites keep the same API (`.mockImplementation`, call assertions,
 * `.mockRestore()`). The default implementation delegates to the original
 * getter with the correct receiver, matching Jest's behaviour.
 */
function spyOnGetter(target, prop) {
    const original = Object.getOwnPropertyDescriptor(target, prop);

    const fn = jest.fn(function () {
        return original && original.get ? original.get.call(this) : undefined;
    });

    Object.defineProperty(target, prop, {
        configurable: true,
        enumerable:   original ? original.enumerable : true,
        get:          fn,
    });

    fn.mockRestore = () => {
        if (original) Object.defineProperty(target, prop, original);
        else          delete target[prop];
    };

    return fn;
}


module.exports = { spyOnGetter };
