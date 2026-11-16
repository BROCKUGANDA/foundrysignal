// Stale-deployment recovery bootstrap.
//
// Root cause it guards: an ISR/CDN-cached HTML document can reference
// `/_next/static/chunks/<hash>.js` from an older build. After a redeploy the
// origin no longer has those files, so every chunk 404s, hydration never
// happens and the app sits on the boot splash (or falls into global-error).
// Reloading with a cache-busted document URL fetches HTML from the new build,
// whose chunk hashes match what the origin actually serves.
//
// Dependency-free on purpose: injected as a raw inline script in <head> so it
// runs even when the JS bundle it is trying to rescue cannot load. Bounded to
// two attempts per two-minute window so a genuinely broken deploy cannot put
// the browser into a reload loop.

const STORAGE_KEY = "fs_asset_recovery";

export const ASSET_RECOVERY_BOOTSTRAP = `(function(){try{
var KEY="${STORAGE_KEY}";
var raw=null;try{raw=sessionStorage.getItem(KEY)}catch(e){}
var s={n:0,t:0};if(raw){try{var p=JSON.parse(raw);if(p&&typeof p.n==="number")s=p}catch(e){}}
setTimeout(function(){try{sessionStorage.removeItem(KEY)}catch(e){}},60000);
window.addEventListener("error",function(e){
var el=e.target;if(!el||el.tagName!=="SCRIPT")return;
var src=el.src||"";if(src.indexOf("/_next/static/")<0)return;
var now=Date.now();if(now-s.t>120000)s.n=0;
if(s.n>=2)return;
s.n=s.n+1;s.t=now;
try{sessionStorage.setItem(KEY,JSON.stringify(s))}catch(err){}
var u=new URL(location.href);u.searchParams.set("__fs_recovery",String(now));
location.replace(u.toString());
},true);
}catch(e){}})();`;

/** Shared recovery marker used by the global error boundary. */
export const RECOVERY_STORAGE_KEY = STORAGE_KEY;

/** Cache-busted URL for a one-shot manual/automatic retry. */
export function recoveryUrl(current: string): string {
  try {
    const u = new URL(current);
    u.searchParams.set("__fs_recovery", String(Date.now()));
    return u.toString();
  } catch {
    return current;
  }
}
