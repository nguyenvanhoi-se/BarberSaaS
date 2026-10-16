export type UploadKind="logo"|"cover"|"hero"|"barber_avatar"|"service_image"|"gallery";
export type UploadedImage={id:string;r2_key:string;url:string;file_size:number;mime_type:string;cleanup_pending?:boolean};
type ApiEnvelope<T>={success:true;data:T};

export type ImageStorageAvailability="configured"|"not_configured"|"unavailable";

export async function getImageStorageAvailability():Promise<ImageStorageAvailability>{
  try{
    const response=await fetch("/api/health/ready",{credentials:"same-origin"});
    if(!response.ok)return "unavailable";
    const payload=await response.json() as {success?:boolean;data?:{checks?:{media_storage?:string}}};
    if(payload.success!==true)return "unavailable";
    return payload.data?.checks?.media_storage==="configured"?"configured":"not_configured";
  }catch{return "unavailable";}
}

export async function uploadShopImage(input:{file:File;kind:UploadKind;resourceId?:string;title?:string;description?:string;category?:string}):Promise<UploadedImage>{
  const form=new FormData();form.set("kind",input.kind);form.set("file",input.file);
  if(input.resourceId)form.set("resource_id",input.resourceId);
  if(input.title)form.set("title",input.title);
  if(input.description)form.set("description",input.description);
  if(input.category)form.set("category",input.category);
  const response=await fetch("/api/shop/media",{method:"POST",body:form,credentials:"include"});
  const payload=await response.json() as ApiEnvelope<UploadedImage|{results:Array<{success:boolean;message?:string;filename?:string;id?:string;r2_key?:string;url?:string;file_size?:number;mime_type?:string}>}>|{success:false;message?:string};
  if(!response.ok||!payload.success)throw new Error("message" in payload?payload.message??"Image upload failed":"Image upload failed");
  if("results" in payload.data){const first=payload.data.results[0];if(!first?.success||!first.id||!first.r2_key||!first.url||!first.file_size||!first.mime_type)throw new Error(first?.message??"Image upload failed");return first as UploadedImage;}
  return payload.data;
}

export async function uploadUserAvatar(file:File):Promise<UploadedImage>{
  const form=new FormData();form.set("file",file);
  const response=await fetch("/api/auth/avatar",{method:"POST",body:form,credentials:"include"});
  const payload=await response.json() as ApiEnvelope<UploadedImage>|{success:false;message?:string};
  if(!response.ok||!payload.success)throw new Error("message" in payload?payload.message??"Image upload failed":"Image upload failed");
  return payload.data;
}

export async function deleteShopImage(kind:UploadKind,resourceId?:string):Promise<void>{
  const response=await fetch("/api/shop/media",{method:"DELETE",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({kind,resource_id:resourceId??null})});
  if(!response.ok)throw new Error("Image could not be deleted");
}

export async function deleteUserAvatar():Promise<void>{
  const response=await fetch("/api/auth/avatar",{method:"DELETE",credentials:"include"});
  if(!response.ok)throw new Error("Image could not be deleted");
}
