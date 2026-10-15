import { Hono } from "hono";
import type { AppEnv } from "../types/app";
import { PLAN_CATALOG } from "../services/plan-catalog";
import { successResponse } from "../utils/http-response";

export const planRoutes=new Hono<AppEnv>();
planRoutes.get("/",(context)=>successResponse(context,Object.entries(PLAN_CATALOG).map(([code,plan])=>({id:code,...plan}))));
