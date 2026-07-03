import { Router } from 'express';
import xvRouter from './xv';
import saRouter from './sa';
import orRouter from './or';

const router = Router();

router.use(xvRouter);
router.use(saRouter);
router.use(orRouter);

export default router;

// ============ Shared Helpers (re-exported from shared.ts) ============
// Constants and helpers live in shared.ts to avoid circular dependency:
// index.ts imports route modules, and route modules import these values.
// If defined here, the const exports would not be initialised yet when
// route modules are required.

export {
  PROJECT_ROOT,
  STOCK_PRICE_DIR,
  VTRACK_DIR,
  KLINE_DIR,
  ONERICH_DIR,
  bjNow,
  bjDateString,
  bjTimeString,
  safeParseStrArray,
} from './shared';
