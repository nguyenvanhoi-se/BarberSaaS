import { useEffect,useState } from "react";
import { Image as ImageIcon,LoaderCircle,Trash2,Upload } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteShopImage,deleteUserAvatar,getImageStorageAvailability,uploadShopImage,uploadUserAvatar,type UploadKind } from "../api/media-api";
import { Image } from "./Image";

type Kind=UploadKind|"user_avatar";
type Props={kind:Kind;resourceId?:string;currentUrl?:string|null;label:string;onChange:(url:string|null)=>void;title?:string;description?:string;category?:string;disabled?:boolean};
const ACCEPT="image/jpeg,image/png,image/webp";

export function ImageUpload({kind,resourceId,currentUrl,label,onChange,title,description,category,disabled=false}:Props){
  const [localPreview,setLocalPreview]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [message,setMessage]=useState("");const queryClient=useQueryClient();
  const storage=useQuery({queryKey:["image-storage-availability"],queryFn:getImageStorageAvailability,staleTime:5*60*1000,retry:false});
  const canUpload=storage.data==="configured";
  useEffect(()=>()=>{if(localPreview)URL.revokeObjectURL(localPreview);},[localPreview]);
  async function upload(file:File){
    setError("");setMessage("");
    if(file.size> (kind==="gallery"?10:5)*1024*1024){setError(`Maximum file size is ${kind==="gallery"?10:5} MB.`);return;}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setError("Choose a JPEG, PNG, or WebP image.");return;}
    if((kind==="barber_avatar"||kind==="service_image")&&!resourceId){setError("Save this record first, then upload its image.");return;}
    const local=URL.createObjectURL(file);setLocalPreview(local);setBusy(true);
    try{
      const result=kind==="user_avatar"?await uploadUserAvatar(file):await uploadShopImage({file,kind,resourceId,title,description,category});
      onChange(result.url);setMessage(result.cleanup_pending?"Image saved; old image cleanup is pending.":"Image uploaded.");await queryClient.invalidateQueries();
      URL.revokeObjectURL(local);setLocalPreview("");
    }catch(cause){setError(cause instanceof Error?cause.message:"Image upload failed.");URL.revokeObjectURL(local);setLocalPreview("");}
    finally{setBusy(false);}
  }
  async function remove(){
    if(currentUrl&&!window.confirm(`Remove ${label.toLowerCase()}? This deletes the stored image.`))return;
    setBusy(true);setError("");setMessage("");
    try{if(kind==="user_avatar")await deleteUserAvatar();else await deleteShopImage(kind,resourceId);onChange(null);await queryClient.invalidateQueries();setMessage("Image removed.");}
    catch(cause){setError(cause instanceof Error?cause.message:"Image could not be removed.");}
    finally{setBusy(false);}
  }
  const source=localPreview||currentUrl;
  return <div className="image-upload">
    <div className="image-upload-preview">{source?<Image src={source} alt={`${label} preview`}/>:<span><ImageIcon size={22}/><small>No image</small></span>}</div>
    <div className="image-upload-controls"><b>{label}</b><small>JPEG, PNG, or WebP · {kind==="gallery"?10:5} MB max</small>
      <label className={`admin-button secondary image-upload-pick${disabled||busy||!canUpload?" disabled":""}`}><Upload size={15}/>{busy?"Uploading…":canUpload?"Choose image":"Uploads unavailable"}<input type="file" accept={ACCEPT} disabled={disabled||busy||!canUpload} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.currentTarget.value="";}}/></label>
      {currentUrl&&<button type="button" className="admin-button danger image-upload-remove" disabled={disabled||busy||!canUpload} onClick={()=>void remove()}><Trash2 size={14}/>Remove</button>}
      {storage.isPending&&<small role="status">Checking image storage availability…</small>}
      {!storage.isPending&&!canUpload&&<small role="status">{storage.data==="not_configured"?"Image uploads are temporarily unavailable because Cloudflare R2 is not configured.":"Image storage is currently unavailable. Uploads are disabled."}</small>}
      {busy&&<span className="image-upload-progress" role="status"><LoaderCircle size={14} className="spin"/>Uploading image…</span>}
      {error&&<small className="image-upload-error" role="alert">{error}</small>}{message&&!error&&<small className="image-upload-message" role="status">{message}</small>}
    </div>
  </div>;
}
