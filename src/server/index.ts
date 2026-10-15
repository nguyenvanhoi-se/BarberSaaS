import { createApp } from "./app";
import type { Bindings } from "./types/bindings";
import { NotificationService } from "./notifications/NotificationService";

const app = createApp();

export { app };
export async function runNotificationSchedule(env:Bindings,now=new Date()){
  const service=new NotificationService(env,env.DB,"cron");
  const result=await service.runScheduled(now);
  console.log(JSON.stringify({event:"notification.scheduler.completed",processed:result.processed,queued:result.queued}));
  return result;
}

export default {
  fetch: app.fetch,
  scheduled(_controller:ScheduledController,env:Bindings,context:ExecutionContext){
    context.waitUntil(runNotificationSchedule(env).catch((error)=>{
      console.error(JSON.stringify({event:"notification.scheduler.failed",errorName:error instanceof Error?error.name:"UnknownError"}));
    }));
  },
};
