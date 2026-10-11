package io.hildegon.hermesmobile;

import android.app.ActivityManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.net.HttpURLConnection;
import java.net.URL;

/** Fixed, authenticated loopback model; installation is separate from agent actions. */
final class LocalModel {
    static boolean ready(PhoneControlPlugin plugin) {
        HttpURLConnection connection=null;
        try {
            connection=(HttpURLConnection)new URL("http://127.0.0.1:8767/v1/models").openConnection();
            connection.setConnectTimeout(1000);connection.setReadTimeout(1000);
            connection.setRequestProperty("Authorization","Bearer "+PhoneControlPlugin.token(plugin.getContext()));
            if(connection.getResponseCode()!=200)return false;
            try(java.io.InputStream input=connection.getInputStream()) {
                byte[] body=new byte[65537];int length=0,count;
                while(length<body.length && (count=input.read(body,length,body.length-length))!=-1)length+=count;
                if(length>65536)return false;
                org.json.JSONArray data=new org.json.JSONObject(new String(body,0,length,java.nio.charset.StandardCharsets.UTF_8)).getJSONArray("data");
                for(int i=0;i<data.length();i++)if("hermes-phone-local".equals(data.getJSONObject(i).optString("id")))return true;
            }
        }catch(Exception ignored){return false;}finally{if(connection!=null)connection.disconnect();}
        return false;
    }
    static void status(PhoneControlPlugin plugin,PluginCall call) {
        plugin.getBridge().execute(()->{
            String phase=PhoneControlPlugin.prefs(plugin.getContext()).getString("modelPhase","idle");
            if("model".equals(PhoneControlPlugin.prefs(plugin.getContext()).getString("setupKind","")) && !java.util.Arrays.asList("idle","ready","stopped","error").contains(phase) && System.currentTimeMillis()>=PhoneControlPlugin.prefs(plugin.getContext()).getLong("setupExpires",0)){PhoneSetup.phase(plugin.getContext(),"error");phase="error";}
            JSObject result=new JSObject();result.put("phase",phase);result.put("ready",ready(plugin));result.put("installed",PhoneControlPlugin.prefs(plugin.getContext()).getBoolean("modelInstalled",false));call.resolve(result);
        });
    }
    static void action(PhoneControlPlugin plugin,PluginCall call) {
        String action=call.getString("action","");
        if(!java.util.Arrays.asList("install","start","stop").contains(action)){call.reject("Acción del modelo no válida.");return;}
        if(!action.equals("stop")) {
            ActivityManager.MemoryInfo memory=new ActivityManager.MemoryInfo();((ActivityManager)plugin.getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE)).getMemoryInfo(memory);
            if(memory.totalMem<7L*1024*1024*1024){call.reject("Este modelo necesita un teléfono con al menos 8 GB de RAM.");return;}
            if(action.equals("start") && memory.availMem<3500L*1024*1024){call.reject("No hay suficiente memoria libre. Cierra otras aplicaciones antes de iniciar el modelo.");return;}
        }
        PhoneSetup.prepareModel(plugin,call,action);
    }
}
