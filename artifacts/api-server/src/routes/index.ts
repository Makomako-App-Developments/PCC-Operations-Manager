import { Router, type IRouter } from "express";
import healthRouter    from "./health";
import authRouter      from "./auth";
import assetsRouter    from "./assets";
import jobsRouter      from "./jobs";
import teamsRouter     from "./teams";
import auditsRouter    from "./audits";
import dashboardRouter from "./dashboard";
import scheduleRouter  from "./schedule";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(assetsRouter);
router.use(jobsRouter);
router.use(teamsRouter);
router.use(auditsRouter);
router.use(dashboardRouter);
router.use(scheduleRouter);

export default router;
