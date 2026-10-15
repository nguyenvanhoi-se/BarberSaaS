import { createMiddleware } from "hono/factory";
import type { UserRole } from "../../shared/auth";
import type { AppEnv } from "../types/app";
import { AppError } from "../utils/app-error";

const OWNER_PATHS=["/services","/barbers","/customers","/reviews","/gallery","/settings","/dashboard","/advanced-statistics","/profile","/change-password","/subscription","/usage","/domains","/media","/billing","/notifications"] as const;

function shopPath(pathname:string){
  const path=pathname.replace(/^\/api(?=\/)/u,"");
  return path.startsWith("/shop/")?path.slice("/shop".length):path;
}

export function allowedRolesForShopPath(pathname:string):readonly UserRole[]|null{
  const path=shopPath(pathname);
  const matches=(prefix:string)=>path===prefix||path.startsWith(`${prefix}/`);
  if(matches("/bookings"))return ["SHOP_OWNER","BARBER"];
  if(OWNER_PATHS.some(matches))return ["SHOP_OWNER"];
  return null;
}

/** Apply role policy to whole resource namespaces, including nested `/:id` routes. */
export const shopRouteAuthorization=createMiddleware<AppEnv>(async(context,next)=>{
  const required=allowedRolesForShopPath(context.req.path);
  if(required){
    const user=context.get("currentUser");
    if(!user)throw new AppError(401,"UNAUTHENTICATED","Authentication required");
    if(!required.includes(user.role))throw new AppError(403,"FORBIDDEN","You do not have permission to access this resource");
  }
  await next();
});
