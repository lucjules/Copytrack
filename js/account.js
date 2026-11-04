// Comptes Copytrack : auth Supabase + sauvegarde cloud. Les invités restent locaux.
import { ONLINE } from './online.js';
import { dumpAll, restoreAll, getJSON, setJSON } from './storage.js';
import { exportCode, parseCode, applySave, reloadProfile } from './profile.js';

const KEY='copytrack.account';
const cleanName=(s)=>String(s||'').trim();
const norm=(s)=>cleanName(s).toLowerCase();
const emailFor=(name)=>norm(name)+'@accounts.copytrack.invalid';
const validName=(name)=>/^[A-Za-z0-9_]{3,20}$/.test(name);
const validPass=(p)=>typeof p==='string'&&p.length>=8;

async function request(path,{method='POST',body,token=null}={}){
  const res=await fetch(ONLINE.url+path,{method,headers:{apikey:ONLINE.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body==null?undefined:JSON.stringify(body)});
  const raw=await res.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}
  if(!res.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||'Erreur serveur ('+res.status+')');
  return data;
}
function normalizeSession(d){if(!d?.access_token)throw new Error('Connexion refusée. Vérifie les paramètres Auth de Supabase.');return {access_token:d.access_token,refresh_token:d.refresh_token,expires_at:d.expires_at||Math.floor(Date.now()/1000)+(d.expires_in||3600),user:d.user};}
export const account={
  state:getJSON(KEY,null),
  get active(){return !!(this.state?.access_token&&this.state?.user?.id)},
  get username(){return this.state?.username||''},
  async signUp(username,password){
    const name=cleanName(username);if(!validName(name))throw new Error('Le pseudo doit contenir 3 à 20 lettres, chiffres ou _ .');
    if(!validPass(password))throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
    const d=await request('/auth/v1/signup',{body:{email:emailFor(name),password,data:{copytrack_username:name}}});
    const s=normalizeSession(d);s.username=name;
    if(!s.access_token)throw new Error('Compte créé. Si Supabase demande une confirmation, le flux username nécessite de désactiver la confirmation email.');
    this.state=s;setJSON(KEY,s);
    await this._profile(name,s.access_token);
    await this.sync(true);
    return s;
  },
  async signIn(username,password){
    const name=cleanName(username);if(!validName(name))throw new Error('Pseudo invalide.');
    const d=await request('/auth/v1/token?grant_type=password',{body:{email:emailFor(name),password}});
    const s=normalizeSession(d);s.username=name;this.state=s;setJSON(KEY,s);
    await this._profile(name,s.access_token);await this.sync(false);return s;
  },
  async _profile(username,token){
    const user_id=this.state.user.id;
    const q='?on_conflict=user_id';
    const res=await request('/rest/v1/copytrack_profiles'+q,{method:'POST',token,body:{user_id,username},});
    return res;
  },
  async sync(uploadLocal=true){
    if(!this.active)throw new Error('Connecte-toi à un compte.');
    const token=this.state.access_token,id=this.state.user.id;
    const headers={apikey:ONLINE.key,Authorization:'Bearer '+token};
    const r=await fetch(ONLINE.url+'/rest/v1/copytrack_saves?user_id=eq.'+encodeURIComponent(id)+'&select=save_data',{headers});
    const txt=await r.text();let rows=[];try{rows=txt?JSON.parse(txt):[]}catch{}
    if(!r.ok)throw new Error('Lecture cloud impossible : '+(rows?.message||r.status));
    if(rows.length&&rows[0].save_data){
      const cloud=rows[0].save_data;
      // Fusion des données : records/circuits/profil combinés avec le mécanisme existant.
      applySave({data:cloud},'merge');
    }
    const save_data=dumpAll();
    const up=await fetch(ONLINE.url+'/rest/v1/copytrack_saves?on_conflict=user_id',{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:id,save_data})});
    if(!up.ok){const t=await up.text();throw new Error('Écriture cloud impossible : '+t);}
    reloadProfile();return true;
  },
  signOut(){this.state=null;try{localStorage.removeItem('shardway.'+KEY)}catch{}},
  async guestRecovery(){return exportCode()},
  async restoreGuest(code){const obj=await parseCode(code);applySave(obj,'replace');return obj;},
};
