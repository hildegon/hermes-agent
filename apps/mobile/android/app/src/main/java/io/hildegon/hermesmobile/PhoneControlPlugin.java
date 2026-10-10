package io.hildegon.hermesmobile;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Set;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.regex.Pattern;

@CapacitorPlugin(name="PhoneControl", permissions=@Permission(alias="termux", strings={"com.termux.permission.RUN_COMMAND"}))
public class PhoneControlPlugin extends Plugin {
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences("phone-control",Context.MODE_PRIVATE); }
    static synchronized String token(Context context) {
        String value=prefs(context).getString("token",null);
        if(value==null) { byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);value=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);prefs(context).edit().putString("token",value).commit(); }
        return value;
    }
    static Set<String> allowed(Context context) { return new HashSet<>(prefs(context).getStringSet("apps",java.util.Collections.singleton("com.android.settings"))); }
    @PluginMethod public void status(PluginCall call) {
        JSObject result=new JSObject(); PhoneControlService service=PhoneControlService.instance;
        result.put("accessibility",service!=null); result.put("enabled",service!=null && service.isActive());result.put("device",Build.MANUFACTURER+" "+Build.MODEL);
        result.put("allowed",new JSArray(allowed(getContext())));
        try {getContext().getPackageManager().getPackageInfo("com.termux",0);result.put("termux",true);} catch(Exception error){result.put("termux",false);}
        call.resolve(result);
    }
    @PluginMethod public void permissions(PluginCall call) { getActivity().startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));call.resolve(); }
    @PluginMethod public void setEnabled(PluginCall call) {
        getActivity().runOnUiThread(()->{
            PhoneControlService service=PhoneControlService.instance;
            if(service==null){call.reject("Activa el servicio de accesibilidad de Hermes en Ajustes.");return;}
            service.setActive(Boolean.TRUE.equals(call.getBoolean("enabled",false)));call.resolve();
        });
    }
    @PluginMethod public void applications(PluginCall call) {
        Intent query=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);JSArray apps=new JSArray();
        Set<String> seen=new HashSet<>();
        for(ResolveInfo info:getContext().getPackageManager().queryIntentActivities(query,0)) {
            String pkg=info.activityInfo.packageName;
            if(pkg.equals(getContext().getPackageName()) || pkg.equals("com.termux") || !seen.add(pkg))continue;
            JSObject item=new JSObject();item.put("package",pkg);item.put("name",String.valueOf(info.loadLabel(getContext().getPackageManager())));apps.put(item);
        }
        JSObject result=new JSObject();result.put("apps",apps);call.resolve(result);
    }
    @PluginMethod public void allowApps(PluginCall call) {
        try {Set<String> apps=new HashSet<>(); JSArray input=call.getArray("apps",new JSArray());
            for(int i=0;i<input.length();i++){String pkg=input.getString(i);getContext().getPackageManager().getPackageInfo(pkg,0);if(pkg.equals(getContext().getPackageName())||pkg.equals("com.termux"))throw new IllegalArgumentException("App reserved for setup");apps.add(pkg);}
            prefs(getContext()).edit().putStringSet("apps",apps).apply(); call.resolve();
        }catch(Exception error){call.reject("Lista de aplicaciones no válida.");}
    }
    @PluginMethod public void startRuntime(PluginCall call) {
        if (getPermissionState("termux") != PermissionState.GRANTED) { requestPermissionForAlias("termux", call, "runtimePermission"); return; }
        try {
            String config=new JSObject().put("token",token(getContext())).toString();
            String encoded=Base64.getEncoder().encodeToString(config.getBytes(StandardCharsets.UTF_8));
            String command="umask 077; mkdir -p ~/hermes-phone; printf '%s' '"+encoded+"' | base64 -d > ~/hermes-phone/bridge.json; exec ~/hermes-phone/start.sh";
            Intent intent=new Intent("com.termux.RUN_COMMAND").setClassName("com.termux","com.termux.app.RunCommandService");
            intent.putExtra("com.termux.RUN_COMMAND_PATH","/data/data/com.termux/files/usr/bin/bash");intent.putExtra("com.termux.RUN_COMMAND_ARGUMENTS",new String[]{"-lc",command});intent.putExtra("com.termux.RUN_COMMAND_BACKGROUND",true);
            getContext().startService(intent);call.resolve();
        }catch(Exception error){call.reject("Autoriza a Hermes Mobile a ejecutar comandos en Termux y prepara el runtime local.");}
    }
    @PermissionCallback private void runtimePermission(PluginCall call) {
        if (getPermissionState("termux") == PermissionState.GRANTED) startRuntime(call);
        else call.reject("Permite que Hermes Mobile ejecute comandos en Termux para iniciar el agente.");
    }
    private static byte[] readBody(java.io.InputStream stream) throws java.io.IOException {
        try (java.io.InputStream input = stream; java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > 8 * 1024 * 1024) throw new java.io.IOException("Response too large");
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }
    private String backendToken() throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL("http://127.0.0.1:9140/").openConnection();connection.setConnectTimeout(3000);connection.setReadTimeout(3000);connection.setRequestProperty("Authorization","Bearer "+token(getContext()));
        try {String html=new String(readBody(connection.getInputStream()),StandardCharsets.UTF_8);
            java.util.regex.Matcher match=Pattern.compile("__HERMES_SESSION_TOKEN__\\s*=\\s*\"([^\"\\\\]+)\"").matcher(html);
            if(!match.find() || !match.group(1).equals(token(getContext())))throw new IllegalStateException("Local Hermes handshake missing");return token(getContext());
        }finally{connection.disconnect();}
    }
    @PluginMethod public void socket(PluginCall call) {
        getBridge().execute(()->{try{JSObject result=new JSObject();result.put("url","ws://127.0.0.1:9140/api/ws?token="+backendToken()+"&profile=default");call.resolve(result);}catch(Exception error){call.reject("Hermes local no está listo. Inícialo en Termux.");}});
    }
    @PluginMethod public void gateway(PluginCall call) {
        getBridge().execute(()->{
            HttpURLConnection connection=null;
            try {
                String path=call.getString("path","");if(!path.startsWith("/api/") || path.contains("..") || path.contains("#") || path.contains("\\"))throw new IllegalArgumentException("Invalid API path");
                String method=call.getString("method","GET");if(!java.util.Arrays.asList("GET","POST","PUT","DELETE","PATCH").contains(method))throw new IllegalArgumentException("Invalid method");
                connection=(HttpURLConnection)new URL("http://127.0.0.1:9140"+path).openConnection();connection.setConnectTimeout(3000);connection.setReadTimeout(30000);connection.setRequestMethod(method);connection.setRequestProperty("Authorization","Bearer "+backendToken());
                String body=call.getString("body");if(body!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");connection.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));}
                int status=connection.getResponseCode();java.io.InputStream stream=status>=400?connection.getErrorStream():connection.getInputStream();
                String text=stream==null?"":new String(readBody(stream),StandardCharsets.UTF_8);JSObject result=new JSObject();result.put("status",status);result.put("body",text);call.resolve(result);
            }catch(Exception error){call.reject("No se pudo conectar con el Hermes del teléfono.");}finally{if(connection!=null)connection.disconnect();}
        });
    }
}
