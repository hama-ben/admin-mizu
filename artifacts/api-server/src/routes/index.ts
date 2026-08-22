import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dataRouter from "./data";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/data", dataRouter);

export default router;
