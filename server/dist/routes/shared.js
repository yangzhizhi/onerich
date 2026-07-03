"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ONERICH_DIR = exports.KLINE_DIR = exports.VTRACK_DIR = exports.STOCK_PRICE_DIR = exports.PROJECT_ROOT = void 0;
exports.bjNow = bjNow;
exports.bjDateString = bjDateString;
exports.bjTimeString = bjTimeString;
exports.safeParseStrArray = safeParseStrArray;
const path_1 = __importDefault(require("path"));
// ============ Path Constants ============
// These MUST live in a separate file (not index.ts) to avoid circular
// dependency issues: index.ts imports the route modules, and route modules
// import these constants. If they were in index.ts, the const values would
// not yet be initialised when route modules are required.
// Project root: two levels up from src/routes/ (or dist/routes/)
exports.PROJECT_ROOT = path_1.default.resolve(__dirname, '..', '..');
// Resolved paths with env var overrides
// Sibling projects live two levels above PROJECT_ROOT (server):
//   server → onerich → git/<sibling>
exports.STOCK_PRICE_DIR = process.env.STOCK_PRICE_DIR
    || path_1.default.resolve(exports.PROJECT_ROOT, '..', '..', 'stock_price');
exports.VTRACK_DIR = process.env.VTRACK_DIR
    || path_1.default.resolve(exports.PROJECT_ROOT, '..', '..', 'v_track');
exports.KLINE_DIR = process.env.KLINE_DIR
    || path_1.default.resolve(exports.PROJECT_ROOT, '..', '..', 'kline');
exports.ONERICH_DIR = process.env.ONERICH_DIR
    || path_1.default.resolve(exports.PROJECT_ROOT, '..', '..', 'onerich');
// ============ Date/Time Helpers (Beijing time) ============
function bjNow() {
    const now = new Date();
    return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}
function bjDateString() {
    const d = bjNow();
    return d.toISOString().slice(0, 10);
}
function bjTimeString() {
    const d = bjNow();
    return d.toISOString().slice(11, 16);
}
// ============ Misc Helpers ============
function safeParseStrArray(value) {
    if (Array.isArray(value))
        return value;
    if (typeof value !== 'string' || !value)
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=shared.js.map