window.chrome = window.chrome || {};
window.chrome.runtime = window.chrome.runtime || {};

window.chrome.runtime.getURL = function (path) {
    if (!path) return '';
    if (path.startsWith('/')) path = path.slice(1);
    return 'lex-extension://' + path;
};

window.chrome.storage = {
    local: {
        get: (keys, cb) => {
            if (cb) cb({});
            return Promise.resolve({});
        },
        set: (items, cb) => {
            if (cb) cb();
            return Promise.resolve();
        }
    }
};
console.log('🔧 Lex Polyfill injected');
