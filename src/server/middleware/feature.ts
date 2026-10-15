import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/app";
import type { FeatureName } from "../services/plan-catalog";
import { PlanService } from "../services/plan.service";
import { AppError } from "../utils/app-error";

export function requireFeature(feature:FeatureName):MiddlewareHandler<AppEnv>{
  return async(context,next)=>{
    const tenant=context.get("currentTenant");if(!tenant)throw new AppError(404,"SHOP_NOT_FOUND","Shop not found");
    await new PlanService(context.env.DB).requireFeature(tenant.id,feature);await next();
  };
}
