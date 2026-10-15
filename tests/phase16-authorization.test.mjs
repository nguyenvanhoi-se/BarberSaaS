import assert from "node:assert/strict";
import { build } from "esbuild";
import { Hono } from "hono";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const result=await build({entryPoints:[resolve(root,"src/server/middleware/shop-route-authorization.ts")],bundle:true,platform:"node",format:"cjs",write:false,target:"node22"});
const module={exports:{}};new Function("module","exports",result.outputFiles[0].text)(module,module.exports);
const {allowedRolesForShopPath}=module.exports;
const ownerOnly=["/api/shop/services/123","/api/shop/barbers/123/working-hours","/api/shop/customers/123","/api/shop/reviews/123/status","/api/shop/gallery/123","/api/shop/settings","/api/shop/domains/123","/api/shop/media","/api/shop/billing/checkout","/api/shop/notifications/settings"];
for(const path of ownerOnly)assert.deepEqual(allowedRolesForShopPath(path),["SHOP_OWNER"],`${path} must stay owner-only`);
for(const path of ["/api/shop/bookings","/api/shop/bookings/123","/api/shop/bookings/123/status"])assert.deepEqual(allowedRolesForShopPath(path),["SHOP_OWNER","BARBER"],`${path} allows the booking roles`);
assert.equal(allowedRolesForShopPath("/api/shop/unmapped"),null);
const {shopRouteAuthorization}=module.exports;
async function requestAs(role,path){
  const app=new Hono();
  app.onError((error,context)=>context.json({success:false,message:error.message},error.status??500));
  app.use("*",async(context,next)=>{context.set("currentUser",{role});await next();},shopRouteAuthorization);
  app.get(path,(context)=>context.json({success:true}));
  return app.request(path);
}
for(const path of ownerOnly){
  const response=await requestAs("CUSTOMER",path);
  assert.equal(response.status,403,`${path} must reject customer role at middleware runtime`);
}
for(const path of ["/api/shop/services/123","/api/shop/barbers/123/working-hours","/api/shop/bookings/123/status"]){
  const response=await requestAs("SHOP_OWNER",path);
  assert.equal(response.status,200,`${path} must allow the authorized role at middleware runtime`);
}
assert.equal((await requestAs("BARBER","/api/shop/services/123")).status,403);
assert.equal((await requestAs("BARBER","/api/shop/bookings/123")).status,200);
console.log("PASS nested shop resource routes receive and enforce explicit role policies");
