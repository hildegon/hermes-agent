package io.hildegon.hermesmobile;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;
import fi.iki.elonen.NanoHTTPD;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;

/** Fixed installation workflow; never exposes a general shell to the agent. */
final class PhoneSetup {
    static final String TERMUX_URL = "https://github.com/termux/termux-app/releases/download/v0.118.3/termux-app_v0.118.3%2Bgithub-debug_arm64-v8a.apk";
    static final String TERMUX_SHA = "72fdb596045116bf5ba1b5bdf5b26fddb9acc0bd074ad9f2da9eb0ae85e83a4e";
    static String phase(Context context) {
        String value=PhoneControlPlugin.prefs(context).getString("setupPhase", "idle");
        if(java.util.Arrays.asList("opening","dependencies","linux","python","starting").contains(value) && System.currentTimeMillis()>=PhoneControlPlugin.prefs(context).getLong("setupExpires",0)){phase(context,"error");return "error";}
        return value;
    }
    static void phase(Context context, String phase) {
        android.content.SharedPreferences.Editor editor=PhoneControlPlugin.prefs(context).edit().putString("setupPhase",phase);
        if(phase.equals("ready") || phase.equals("error"))editor.remove("setupNonce");
        editor.apply();
    }
    static boolean authorized(Context context, String header) {
        String nonce=PhoneControlPlugin.prefs(context).getString("setupNonce", "");
        return !nonce.isEmpty() && System.currentTimeMillis()<PhoneControlPlugin.prefs(context).getLong("setupExpires",0) && MessageDigest.isEqual(("Bearer "+nonce).getBytes(java.nio.charset.StandardCharsets.UTF_8),String.valueOf(header).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
    static NanoHTTPD.Response serve(Context context, NanoHTTPD.IHTTPSession session) throws Exception {
        String path=session.getUri().substring("/setup/".length());
        if(session.getMethod()==NanoHTTPD.Method.POST && path.equals("status")) {
            int length=Integer.parseInt(session.getHeaders().getOrDefault("content-length","-1"));
            if(length<0 || length>1024 || session.getHeaders().containsKey("transfer-encoding"))throw new IllegalArgumentException("Invalid status body");
            HashMap<String,String> body=new HashMap<>();session.parseBody(body);
            String value=new JSONObject(body.getOrDefault("postData","{}")).getString("phase");
            if(!java.util.Arrays.asList("dependencies","linux","python","starting","ready","error").contains(value))throw new IllegalArgumentException("Invalid installation phase");
            phase(context,value);
            return NanoHTTPD.newFixedLengthResponse("{}");
        }
        if(session.getMethod()!=NanoHTTPD.Method.GET)throw new IllegalArgumentException("Unsupported setup request");
        if(path.equals("bridge.json")){NanoHTTPD.Response response=NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.OK,"application/json",new JSONObject().put("token",PhoneControlPlugin.token(context)).toString());response.addHeader("Cache-Control","no-store");return response;}
        if(!java.util.Arrays.asList("install.sh","start.sh","runtime.py","configure.py","plugin/plugin.yaml","plugin/__init__.py").contains(path))return NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.NOT_FOUND,"text/plain","Unknown setup resource");
        NanoHTTPD.Response response=NanoHTTPD.newChunkedResponse(NanoHTTPD.Response.Status.OK,"text/plain",context.getAssets().open("phone/"+path));response.addHeader("Cache-Control","no-store");return response;
    }
    static void prepare(PhoneControlPlugin plugin, com.getcapacitor.PluginCall call) {
        if(Build.VERSION.SDK_INT<33){call.reject("La preparación automática requiere Android 13 o posterior.");return;}
        PhoneControlService service=PhoneControlService.instance;
        if(service==null || !service.canPrepare()){call.reject("Activa primero la accesibilidad de Hermes Mobile.");return;}
        String nonce=java.util.UUID.randomUUID().toString().replace("-","")+java.util.UUID.randomUUID().toString().replace("-","");
        PhoneControlPlugin.prefs(plugin.getContext()).edit().putString("setupNonce",nonce).putLong("setupExpires",System.currentTimeMillis()+3600000).putString("setupPhase","opening").apply();
        String encoded;
        try {
            String script=new String(asset(plugin.getContext(),"install.sh"),java.nio.charset.StandardCharsets.UTF_8);
            String[][] resources={{"START","start.sh"},{"RUNTIME","runtime.py"},{"CONFIGURE","configure.py"},{"MANIFEST","plugin/plugin.yaml"},{"PLUGIN","plugin/__init__.py"}};
            for(String[] resource:resources)script=script.replace("@SHA_"+resource[0]+"@",sha(asset(plugin.getContext(),resource[1])));
            script=script.replace("@SHA_BRIDGE@",sha(new JSONObject().put("token",PhoneControlPlugin.token(plugin.getContext())).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            encoded=java.util.Base64.getEncoder().encodeToString(script.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }catch(Exception error){phase(plugin.getContext(),"error");call.reject("No se pudo cargar el instalador incluido en la app.");return;}
        String command="HERMES_PHONE_SETUP_TOKEN='"+nonce+"' bash -c \"$(printf '%s' '"+encoded+"' | base64 -d)\"";
        service.prepareTermux(command,()->call.resolve(),message->{phase(plugin.getContext(),"error");call.reject(message);});
    }
    private static byte[] asset(Context context,String path) throws Exception {
        try(java.io.InputStream input=context.getAssets().open("phone/"+path);java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream()){
            byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);return output.toByteArray();
        }
    }
    private static String sha(byte[] bytes) throws Exception { StringBuilder result=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))result.append(String.format("%02x",b));return result.toString(); }
    static void installTermux(PhoneControlPlugin plugin, com.getcapacitor.PluginCall call) {
        plugin.getBridge().execute(()->{
            try {
                if(!java.util.Arrays.asList(Build.SUPPORTED_ABIS).contains("arm64-v8a"))throw new IllegalStateException("Esta versión del entorno requiere un teléfono ARM64.");
                File apk=new File(plugin.getContext().getCacheDir(),"hermes-termux.apk");
                MessageDigest hash=MessageDigest.getInstance("SHA-256");
                java.net.HttpURLConnection connection=(java.net.HttpURLConnection)new URL(TERMUX_URL).openConnection();connection.setConnectTimeout(15000);connection.setReadTimeout(30000);
                try(java.io.InputStream input=connection.getInputStream();FileOutputStream output=new FileOutputStream(apk)) {
                    byte[] buffer=new byte[8192];int length;long total=0;
                    while((length=input.read(buffer))!=-1){total+=length;if(total>100*1024*1024)throw new IllegalStateException("Descarga demasiado grande");hash.update(buffer,0,length);output.write(buffer,0,length);}
                }finally{connection.disconnect();}
                StringBuilder digest=new StringBuilder();for(byte b:hash.digest())digest.append(String.format("%02x",b));
                if(!TERMUX_SHA.equals(digest.toString())){apk.delete();throw new IllegalStateException("La descarga no coincide con la versión verificada.");}
                Uri uri=FileProvider.getUriForFile(plugin.getContext(),plugin.getContext().getPackageName()+".fileprovider",apk);
                plugin.getActivity().runOnUiThread(()->{try{plugin.getActivity().startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));call.resolve();}catch(Exception e){call.reject("No se pudo abrir el instalador de Android.");}});
            }catch(Exception error){call.reject(error.getMessage()==null?"No se pudo descargar Termux.":error.getMessage());}
        });
    }
}
