import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import maintenanceRouter from "./maintenance";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(maintenanceRouter);
router.use(storageRouter);

export default router;
