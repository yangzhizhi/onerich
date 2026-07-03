"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = __importDefault(require("./routes"));
const logger_1 = require("./services/logger");
const scriptRunner_1 = require("./services/scriptRunner");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3002;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api', routes_1.default);
// Ensure logs directory exists on startup
const logsDir = path_1.default.join(__dirname, '..', 'data', 'logs');
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
// Cleanup old logs on startup
(0, logger_1.cleanupOldLogs)();
(0, scriptRunner_1.cleanupOldScriptLogs)();
app.listen(PORT, () => {
    (0, logger_1.logInfo)(`Server running on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map