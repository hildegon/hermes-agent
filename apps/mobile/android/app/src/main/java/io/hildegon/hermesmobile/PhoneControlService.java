package io.hildegon.hermesmobile;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import fi.iki.elonen.NanoHTTPD;

/** User-enabled, authenticated loopback bridge for the local Hermes plugin. */
public class PhoneControlService extends AccessibilityService {
    static volatile PhoneControlService instance;
    static final int PORT = 8766;
    private NanoHTTPD server;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, AccessibilityNodeInfo> nodes = new HashMap<>();
    private String snapshot = "";
    private String snapshotPackage = "";
    private volatile boolean active = false;

    @Override protected void onServiceConnected() {
        instance = this;
        server = new NanoHTTPD("127.0.0.1", PORT) {
            @Override public Response serve(IHTTPSession session) {
                try {
                    if (session.getUri().startsWith("/setup/")) {
                        if (!PhoneSetup.authorized(PhoneControlService.this,session.getHeaders().get("authorization"))) return response(Response.Status.UNAUTHORIZED,new JSONObject().put("error","Installation authorization required"));
                        return PhoneSetup.serve(PhoneControlService.this,session);
                    }
                    String expected = "Bearer " + PhoneControlPlugin.token(PhoneControlService.this);
                    if (!expected.equals(session.getHeaders().get("authorization"))) return response(Response.Status.UNAUTHORIZED, new JSONObject().put("error", "Authentication required"));
                    if (session.getMethod() == Method.GET && session.getUri().equals("/status")) return response(Response.Status.OK, new JSONObject().put("enabled", active));
                    if (!active) return response(Response.Status.FORBIDDEN, new JSONObject().put("error", "Enable phone control in Hermes Mobile"));
                    JSONObject input = new JSONObject();
                    if (session.getMethod() == Method.POST && session.getUri().equals("/action")) {
                        int length = Integer.parseInt(session.getHeaders().getOrDefault("content-length", "-1"));
                        if (length < 0 || length > 32768 || session.getHeaders().containsKey("transfer-encoding")) throw new IllegalArgumentException("Request too large");
                        Map<String, String> body = new HashMap<>(); session.parseBody(body);
                        input = new JSONObject(body.getOrDefault("postData", "{}"));
                    } else if (!(session.getMethod() == Method.GET && session.getUri().equals("/state"))) return response(Response.Status.NOT_FOUND, new JSONObject().put("error", "Unknown route"));
                    final JSONObject request = input;
                    final JSONObject[] result = new JSONObject[1];
                    final Exception[] failure = new Exception[1];
                    CountDownLatch completed = new CountDownLatch(1);
                    main.post(() -> {
                        try { if (!active) throw new IllegalStateException("Phone control stopped"); result[0] = session.getUri().equals("/state") ? state() : action(request); }
                        catch (Exception error) { failure[0] = error; }
                        finally { completed.countDown(); }
                    });
                    if (!completed.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Phone did not respond");
                    if (failure[0] != null) throw failure[0];
                    return response(Response.Status.OK, result[0]);
                } catch (Exception error) {
                    try { return response(Response.Status.BAD_REQUEST, new JSONObject().put("error", error.getMessage() == null ? "Action failed" : error.getMessage())); }
                    catch (Exception ignored) { return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "Action failed"); }
                }
            }
        };
        try { server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false); }
        catch (java.io.IOException error) { server = null; }
    }
    private static NanoHTTPD.Response response(NanoHTTPD.Response.Status status, JSONObject body) {
        NanoHTTPD.Response response = NanoHTTPD.newFixedLengthResponse(status, "application/json", body.toString());
        response.addHeader("Cache-Control", "no-store"); return response;
    }
    void setActive(boolean value) { active = value; clearNodes(); }
    boolean isActive() { return active && server != null; }
    private void clearNodes() { for (AccessibilityNodeInfo node : nodes.values()) node.recycle(); nodes.clear(); snapshot = ""; }
    private void allowed(String pkg) {
        if (!PhoneControlPlugin.allowed(this).contains(pkg)) throw new IllegalArgumentException("App not authorized: " + pkg + ". Enable it in Hermes Mobile first.");
    }
    private JSONObject state() throws Exception {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) throw new IllegalStateException("No accessible window. Unlock the phone first.");
        try {
            String pkg = String.valueOf(root.getPackageName()); allowed(pkg);
            clearNodes(); snapshot = UUID.randomUUID().toString(); snapshotPackage = pkg;
            JSONArray items = new JSONArray(); walk(root, items, 0);
            return new JSONObject().put("package", pkg).put("snapshot", snapshot).put("nodes", items).put("truncated", items.length() >= 150);
        } finally { root.recycle(); }
    }
    private void walk(AccessibilityNodeInfo node, JSONArray items, int depth) throws Exception {
        if (depth > 30 || items.length() >= 150 || node.isPassword()) return;
        if (node.isVisibleToUser() && (node.getText() != null || node.getContentDescription() != null || node.isClickable() || node.isEditable() || node.isScrollable())) {
            String id = String.valueOf(items.length()); Rect bounds = new Rect(); node.getBoundsInScreen(bounds);
            nodes.put(id, AccessibilityNodeInfo.obtain(node));
            items.put(new JSONObject().put("id", id).put("text", clip(node.getText())).put("description", clip(node.getContentDescription())).put("class", String.valueOf(node.getClassName())).put("clickable", node.isClickable()).put("editable", node.isEditable()).put("scrollable", node.isScrollable()).put("bounds", new JSONArray(new int[]{bounds.left,bounds.top,bounds.right,bounds.bottom})));
        }
        for (int i=0;i<node.getChildCount() && items.length()<150;i++) { AccessibilityNodeInfo child=node.getChild(i); if(child!=null) { try { walk(child,items,depth+1); } finally { child.recycle(); } } }
    }
    private static String clip(CharSequence value) { String text=value==null ? "" : value.toString(); return text.substring(0, Math.min(text.length(), 1500)); }
    private JSONObject action(JSONObject input) throws Exception {
        if (!active) throw new IllegalStateException("Phone control stopped");
        String action = input.getString("action");
        if (action.equals("launch")) {
            String pkg=input.getString("package"); allowed(pkg);
            Intent intent = pkg.equals("com.android.settings") ? new Intent(android.provider.Settings.ACTION_SETTINGS) : getPackageManager().getLaunchIntentForPackage(pkg);
            if(intent==null) throw new IllegalArgumentException("App cannot be opened"); intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(intent); clearNodes();
            return new JSONObject().put("ok",true).put("note","App launched; read state to verify");
        }
        AccessibilityNodeInfo root=getRootInActiveWindow();
        if(root==null) throw new IllegalStateException("No accessible window");
        String pkg=String.valueOf(root.getPackageName()); root.recycle(); allowed(pkg);
        if(action.equals("back") || action.equals("home")) {
            boolean ok=performGlobalAction(action.equals("back") ? GLOBAL_ACTION_BACK : GLOBAL_ACTION_HOME); clearNodes(); return new JSONObject().put("ok",ok);
        }
        if(!input.getString("snapshot").equals(snapshot) || !pkg.equals(snapshotPackage)) throw new IllegalArgumentException("Screen changed; read state again");
        AccessibilityNodeInfo node=nodes.get(input.getString("id"));
        if(node==null || !node.refresh() || node.isPassword() || !node.isVisibleToUser()) throw new IllegalArgumentException("Element unavailable; read state again");
        boolean ok;
        switch(action) {
            case "click": ok=node.performAction(AccessibilityNodeInfo.ACTION_CLICK); break;
            case "text":
                if(!node.isEditable()) throw new IllegalArgumentException("Element is not editable");
                String text=input.getString("text"); if(text.length()>10000) throw new IllegalArgumentException("Text too long");
                Bundle args=new Bundle(); args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,text); ok=node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,args); break;
            case "scroll":
                String direction=input.getString("direction"); if(!direction.equals("forward") && !direction.equals("backward")) throw new IllegalArgumentException("Invalid direction");
                ok=node.performAction(direction.equals("backward") ? AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD : AccessibilityNodeInfo.ACTION_SCROLL_FORWARD); break;
            default: throw new IllegalArgumentException("Unsupported action");
        }
        clearNodes(); return new JSONObject().put("ok",ok).put("note","Read state again to verify the result");
    }
    @Override public android.accessibilityservice.InputMethod onCreateInputMethod() { return new android.accessibilityservice.InputMethod(this); }
    boolean canPrepare() { return server != null; }
    void prepareTermux(String command, Runnable success, java.util.function.Consumer<String> failure) {
        main.post(() -> {
            try {
                if (((android.app.KeyguardManager)getSystemService(KEYGUARD_SERVICE)).isDeviceLocked())throw new IllegalStateException("Desbloquea el teléfono para preparar el entorno.");
                startActivity(new Intent(Intent.ACTION_RUN).setClassName("com.termux","com.termux.app.TermuxActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
                enterSetup(command,success,failure,0);
            }catch(Exception error){PhoneSetup.phase(this,"error");failure.accept(error instanceof IllegalStateException ? error.getMessage() : "No se pudo abrir Termux. Instálalo y ábrelo una vez.");}
        });
    }
    private void enterSetup(String command, Runnable success, java.util.function.Consumer<String> failure, int attempt) {
        main.postDelayed(() -> {
            android.accessibilityservice.InputMethod method=getInputMethod();
            android.view.inputmethod.EditorInfo editor=method==null?null:method.getCurrentInputEditorInfo();
            AccessibilityNodeInfo root=getRootInActiveWindow();
            boolean termux=root!=null && "com.termux".contentEquals(root.getPackageName()); if(root!=null)root.recycle();
            if(termux && editor!=null && "com.termux".equals(editor.packageName) && method.getCurrentInputConnection()!=null) {
                method.getCurrentInputConnection().commitText(command+"\n",1,null);success.run();
            }else if(attempt<30)enterSetup(command,success,failure,attempt+1);
            else{PhoneSetup.phase(this,"error");failure.accept("No se pudo preparar Termux. Abre su terminal, toca el área de escritura y vuelve a Preparar Hermes.");}
        },500);
    }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) { if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) clearNodes(); }
    @Override public void onInterrupt() { setActive(false); }
    @Override public void onDestroy() { setActive(false); if(server!=null) server.stop(); instance=null; super.onDestroy(); }
}
