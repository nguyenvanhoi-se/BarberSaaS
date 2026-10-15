import { Hono } from "hono";
import type { AppEnv } from "../types/app";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { BookingRepository } from "../repositories/booking.repository";
import { cancelCustomerBooking, createBooking } from "../services/booking.service";
import { createBookingSchema } from "../validators/booking";
import { requireActiveTenant } from "../middleware/tenant";
import { AppError } from "../utils/app-error";
import { successResponse } from "../utils/http-response";
import { PlanService } from "../services/plan.service";
import { rateLimit } from "../middleware/rate-limit";
import { NotificationService } from "../notifications/NotificationService";
import { CustomerReviewRepository } from "../repositories/customer-review.repository";
import { z } from "zod";

export const customerRoutes = new Hono<AppEnv>();
customerRoutes.use("*", requireTenant, requireAuth, requireRole("CUSTOMER"));
customerRoutes.use("/bookings", requireActiveTenant);

customerRoutes.post("/bookings", rateLimit((env) => env.BOOKING_RATE_LIMIT, "booking"), async (context) => {
  const tenant = context.get("currentTenant");
  const user = context.get("currentUser");
  if (!tenant || !user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  const parsed = createBookingSchema.safeParse(await context.req.json());
  if (!parsed.success) throw new AppError(422, "VALIDATION_ERROR", "Booking details are invalid", parsed.error.issues.map((issue) => ({ code: "INVALID_VALUE", message: issue.message, field: issue.path.join(".") })));
  const planService=new PlanService(context.env.DB);await planService.assertBookingMonthWithinLimit(tenant.id);
  const booking = await createBooking(new BookingRepository(context.env.DB), tenant.id, user, parsed.data,await planService.monthlyBookingLimit(tenant.id));
  const notifications=new NotificationService(context.env,context.env.DB,context.get("requestId"));
  notifications.safeDispatch(context.executionCtx,notifications.bookingEvent("BOOKING_CREATED",booking,context.executionCtx),tenant.id);
  return successResponse(context, booking, 201);
});

customerRoutes.get("/bookings", async (context) => {
  const tenant = context.get("currentTenant");
  const user = context.get("currentUser");
  if (!tenant || !user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  const result = await new BookingRepository(context.env.DB).customerBookings(tenant.id, user.id);
  return successResponse(context, result.results);
});

customerRoutes.get("/bookings/:id", async (context) => {
  const tenant = context.get("currentTenant");
  const user = context.get("currentUser");
  if (!tenant || !user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  const booking = await new BookingRepository(context.env.DB).customerBooking(tenant.id, user.id, context.req.param("id"));
  if (!booking) throw new AppError(404, "NOT_FOUND", "Booking not found");
  const review = await new CustomerReviewRepository(context.env.DB).forCustomerBooking(tenant.id,user.id,booking.id);
  return successResponse(context, {...booking,review});
});

customerRoutes.post("/bookings/:id/review",async(context)=>{
  const tenant=context.get("currentTenant"),user=context.get("currentUser");
  if(!tenant||!user)throw new AppError(401,"UNAUTHENTICATED","Authentication required");
  let body:unknown;try{body=await context.req.json();}catch{throw new AppError(400,"INVALID_JSON","Request body must be JSON");}
  const parsed=z.object({rating:z.number().int().min(1).max(5),comment:z.string().trim().max(2000).optional()}).strict().safeParse(body);
  if(!parsed.success)throw new AppError(422,"VALIDATION_ERROR","Review details are invalid",parsed.error.issues.map((issue)=>({code:"INVALID_VALUE",message:issue.message,field:issue.path.join(".")})));
  const repository=new CustomerReviewRepository(context.env.DB),bookingId=context.req.param("id");
  const reviewId=await repository.createForCompletedBooking({shopId:tenant.id,customerId:user.id,bookingId,rating:parsed.data.rating,comment:parsed.data.comment?.trim()||null});
  if(!reviewId){
    const booking=await repository.customerBookingState(tenant.id,user.id,bookingId);
    if(!booking)throw new AppError(404,"NOT_FOUND","Booking not found");
    if(booking.status!=="COMPLETED")throw new AppError(409,"BOOKING_NOT_REVIEWABLE","Only completed bookings can be reviewed");
    throw new AppError(409,"REVIEW_ALREADY_EXISTS","This booking has already been reviewed");
  }
  const review=await repository.forCustomerBooking(tenant.id,user.id,bookingId);
  return successResponse(context,review,201);
});

customerRoutes.patch("/bookings/:id/cancel", async (context) => {
  const tenant = context.get("currentTenant");
  const user = context.get("currentUser");
  if (!tenant || !user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  const booking = await cancelCustomerBooking(new BookingRepository(context.env.DB), tenant.id, user, context.req.param("id"));
  if(booking){const notifications=new NotificationService(context.env,context.env.DB,context.get("requestId"));notifications.safeDispatch(context.executionCtx,notifications.bookingEvent("BOOKING_CANCELLED",booking,context.executionCtx),tenant.id);}
  return successResponse(context, booking);
});
