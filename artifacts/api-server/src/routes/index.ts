import { Router, type IRouter } from "express";
import healthRouter      from "./health";
import authRouter        from "./auth";
import assetsRouter      from "./assets";
import jobsRouter        from "./jobs";
import teamsRouter       from "./teams";
import auditsRouter      from "./audits";
import programmesRouter  from "./programmes";
import dashboardRouter   from "./dashboard";
import scheduleRouter    from "./schedule";
import auditLogRouter    from "./audit-log";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(assetsRouter);
router.use(jobsRouter);
router.use(teamsRouter);
router.use(auditsRouter);
router.use(programmesRouter);
router.use(dashboardRouter);
router.use(scheduleRouter);
router.use(auditLogRouter);

export default router;
