const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export function getToken(){return typeof window==='undefined'?null:sessionStorage.getItem('ninechang_token')}
export async function api<T>(path:string,init:RequestInit={}):Promise<T>{const token=getToken();const response=await fetch(`${API_URL}${path}`,{...init,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...init.headers}});const value=await response.json().catch(()=>({}));if(!response.ok)throw new Error(value.message??'ระบบขัดข้อง');return value as T}
