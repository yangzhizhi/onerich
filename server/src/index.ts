import express from 'express';
import cors from 'cors';
import routes from './routes';
import { logInfo, cleanupOldLogs } from './services/logger';
import { cleanupOldScriptLogs } from './services/scriptRunner';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use('/api', routes);

// Ensure logs directory exists on startup
const logsDir = path.join(__dirname, '..', 'data', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Cleanup old logs on startup
cleanupOldLogs();
cleanupOldScriptLogs();

app.listen(PORT, () => {
  logInfo(`Server running on http://localhost:${PORT}`);
});
