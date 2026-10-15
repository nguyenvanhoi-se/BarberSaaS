import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/app";
import { MediaRepository, type MediaTarget } from "../repositories/media.repository";
import { imageKey, publicImageUrl, StorageService, validateImageFile, type ImageKind } from "../services/storage.service";
import type { AuthUser } from "../../shared/auth";
import { requireRole } from "../middleware/auth";
import { AppError } from "../utils/app-error";
import { successResponse } from "../utils/http-response";
import { PlanService } from "../services/plan.service";
import { rateLimit } from "../middleware/rate-limit";
import { logServerError } from "../utils/server-log";

export const shopMediaRoutes = new Hono<AppEnv>();
shopMediaRoutes.use("*", requireRole("SHOP_OWNER"));

const imageKindSchema=z.enum(["logo","cover","hero","barber_avatar","service_image","gallery"]);
const targetSchema=z.object({kind:imageKindSchema,resource_id:z.string().trim().min(1).max(128).nullable().optional()}).strict();
const ONE_FILE_LIMIT=5*1024*1024;
const GALLERY_FILE_LIMIT=10*1024*1024;

function validateTarget(kind:ImageKind,resourceId:string|null):MediaTarget{
  const requiresResource=kind==="barber_avatar"||kind==="service_image";
  if(requiresResource&&!resourceId)throw new AppError(422,"RESOURCE_REQUIRED","A barber or service is required");
  if(!requiresResource&&resourceId)throw new AppError(422,"INVALID_RESOURCE","This image type does not accept a resource ID");
  return {kind,resourceId};
}

async function uploadOne(input:{context:import("hono").Context<AppEnv>;shopId:string;user:AuthUser;repository:MediaRepository;storage:StorageService;kind:ImageKind;resourceId:string|null;file:File;title:string;description:string|null;category:string|null}){
  const {context,shopId,user,repository,storage,kind,resourceId,file,title,description,category}=input;
  const contentType=await validateImageFile(file,kind==="gallery"?GALLERY_FILE_LIMIT:ONE_FILE_LIMIT);
  const target=validateTarget(kind,resourceId);
  if(kind==="gallery")await new PlanService(context.env.DB).assertCanCreate(shopId,"gallery");
  const existing=kind==="gallery"?null:await repository.currentShopMedia(shopId,target);
  if((kind==="barber_avatar"||kind==="service_image")&&!existing)throw new AppError(404,"NOT_FOUND",kind==="barber_avatar"?"Barber not found":"Service not found");
  const id=kind==="gallery"?crypto.randomUUID():resourceId??shopId;
  const key=imageKey(shopId,kind,contentType,id===shopId||kind==="gallery"?undefined:id);
  const url=publicImageUrl(key);
  const metadata={shop_id:shopId,kind,...(resourceId?{resource_id:resourceId}:{})};
  try{await storage.upload(key,file.stream(),contentType,metadata);}
  catch(error){
    try{await storage.delete(key);}catch(cleanupError){logServerError("r2.cleanup_failed",context.get("requestId"),cleanupError,{key});}
    logServerError("r2.image_upload_failed",context.get("requestId"),error,{kind});
    throw new AppError(502,"UPLOAD_FAILED","Image upload failed");
  }

  let saved:Record<string,unknown>;
  try{saved=await repository.saveShopMedia({shopId,user,target,id,key,url,title,description,category,size:file.size,mime:contentType});}
  catch(error){
    try{await storage.delete(key);}catch(cleanupError){logServerError("r2.cleanup_failed",context.get("requestId"),cleanupError,{key});}
    logServerError("r2.image_metadata_write_failed",context.get("requestId"),error,{kind});
    throw new AppError(500,"MEDIA_METADATA_SAVE_FAILED","Image could not be saved");
  }

  let cleanupPending=false;
  const oldKey=existing?.r2_key;
  if(oldKey&&oldKey!==key&&!await repository.isReferenced(oldKey)){
    try{await storage.delete(oldKey);}
    catch(error){cleanupPending=true;logServerError("r2.old_image_cleanup_failed",context.get("requestId"),error,{key:oldKey});}
  }
  return {...saved,id,key,r2_key:key,url,file_size:file.size,mime_type:contentType,cleanup_pending:cleanupPending};
}

shopMediaRoutes.post("/",rateLimit((env) => env.UPLOAD_RATE_LIMIT,"upload"),async(context)=>{
  const tenant=context.get("currentTenant");const user=context.get("currentUser");
  if(!tenant||!user)throw new AppError(401,"UNAUTHENTICATED","Authentication required");
  let form:FormData;try{form=await context.req.formData();}catch{throw new AppError(400,"INVALID_MULTIPART","A multipart image upload is required");}
  const parsed=targetSchema.safeParse({kind:form.get("kind"),resource_id:form.get("resource_id")||null});
  if(!parsed.success)throw new AppError(422,"VALIDATION_ERROR","Image type or resource is invalid");
  const kind=parsed.data.kind;const title=String(form.get("title")??"").trim();const description=String(form.get("description")??"").trim()||null;const category=String(form.get("category")??"").trim()||null;
  if(kind==="gallery"&&(!title||title.length>160||description&&description.length>1000||category&&category.length>80))throw new AppError(422,"VALIDATION_ERROR","Gallery title, description, or category is invalid");
  const rawFiles=form.getAll("files").length?form.getAll("files"):form.getAll("file");
  const files=rawFiles.filter((value):value is File=>value instanceof File);
  if(!files.length||files.length!==rawFiles.length)throw new AppError(422,"INVALID_IMAGE","Choose one or more supported image files");
  if(files.length>1&&kind!=="gallery")throw new AppError(422,"MULTIPLE_FILES_NOT_SUPPORTED","Multiple files are only supported for gallery uploads");

  const repository=new MediaRepository(context.env.DB);const storage=new StorageService(context.env.MEDIA_BUCKET);const results:Array<Record<string,unknown>>=[];
  for(const file of files){
    try{results.push({success:true,...await uploadOne({context,shopId:tenant.id,user,repository,storage,kind,resourceId:parsed.data.resource_id??null,file,title:title||file.name.replace(/\.[^.]+$/u,""),description,category})});}
    catch(error){results.push({success:false,filename:file.name,message:error instanceof AppError?error.message:"Image upload failed",status:error instanceof AppError?error.status:500,code:error instanceof AppError?error.code:"UPLOAD_FAILED"});}
  }
  if(files.length===1){const result=results[0];if(result.success!==true)throw new AppError((result.status??422) as 422|413|500|502,String(result.code??"UPLOAD_FAILED"),String(result.message));return successResponse(context,result,201);}
  return successResponse(context,{results,uploaded:results.filter((result)=>result.success).length,failed:results.filter((result)=>!result.success).length},207);
});

shopMediaRoutes.delete("/",rateLimit((env) => env.UPLOAD_RATE_LIMIT,"upload"),async(context)=>{
  const tenant=context.get("currentTenant");const user=context.get("currentUser");if(!tenant||!user)throw new AppError(401,"UNAUTHENTICATED","Authentication required");
  const parsed=targetSchema.safeParse(await context.req.json().catch(()=>null));if(!parsed.success)throw new AppError(422,"VALIDATION_ERROR","Image type or resource is invalid");
  const target=validateTarget(parsed.data.kind,parsed.data.resource_id??null);const repository=new MediaRepository(context.env.DB);const storage=new StorageService(context.env.MEDIA_BUCKET);
  const existing=await repository.currentShopMedia(tenant.id,target);
  if(!existing){if(target.kind==="hero")return successResponse(context,{deleted:true});throw new AppError(404,"NOT_FOUND","Image owner or image not found");}
  const key=existing.r2_key;
  if(key){try{await storage.delete(key);}catch(error){logServerError("r2.image_delete_failed",context.get("requestId"),error,{key});throw new AppError(502,"IMAGE_DELETE_FAILED","Image could not be deleted");}}
  try{await repository.clearShopMedia(tenant.id,user,target);}
  catch(error){logServerError("r2.image_metadata_delete_failed",context.get("requestId"),error,{kind:target.kind});throw new AppError(500,"MEDIA_METADATA_DELETE_FAILED","Image metadata could not be deleted; retry the operation");}
  return successResponse(context,{deleted:true});
});
