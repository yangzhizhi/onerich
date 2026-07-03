"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeParseStrArray = exports.bjTimeString = exports.bjDateString = exports.bjNow = exports.ONERICH_DIR = exports.KLINE_DIR = exports.VTRACK_DIR = exports.STOCK_PRICE_DIR = exports.PROJECT_ROOT = void 0;
const express_1 = require("express");
const xv_1 = __importDefault(require("./xv"));
const sa_1 = __importDefault(require("./sa"));
const or_1 = __importDefault(require("./or"));
const router = (0, express_1.Router)();
router.use(xv_1.default);
router.use(sa_1.default);
router.use(or_1.default);
exports.default = router;
// ============ Shared Helpers (re-exported from shared.ts) ============
// Constants and helpers live in shared.ts to avoid circular dependency:
// index.ts imports route modules, and route modules import these values.
// If defined here, the const exports would not be initialised yet when
// route modules are required.
var shared_1 = require("./shared");
Object.defineProperty(exports, "PROJECT_ROOT", { enumerable: true, get: function () { return shared_1.PROJECT_ROOT; } });
Object.defineProperty(exports, "STOCK_PRICE_DIR", { enumerable: true, get: function () { return shared_1.STOCK_PRICE_DIR; } });
Object.defineProperty(exports, "VTRACK_DIR", { enumerable: true, get: function () { return shared_1.VTRACK_DIR; } });
Object.defineProperty(exports, "KLINE_DIR", { enumerable: true, get: function () { return shared_1.KLINE_DIR; } });
Object.defineProperty(exports, "ONERICH_DIR", { enumerable: true, get: function () { return shared_1.ONERICH_DIR; } });
Object.defineProperty(exports, "bjNow", { enumerable: true, get: function () { return shared_1.bjNow; } });
Object.defineProperty(exports, "bjDateString", { enumerable: true, get: function () { return shared_1.bjDateString; } });
Object.defineProperty(exports, "bjTimeString", { enumerable: true, get: function () { return shared_1.bjTimeString; } });
Object.defineProperty(exports, "safeParseStrArray", { enumerable: true, get: function () { return shared_1.safeParseStrArray; } });
//# sourceMappingURL=index.js.map