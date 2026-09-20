export interface SpokeUser {
  uid: string;
  email: string;
  roles: string[];
}

export interface AuditEventPayload {
  action:
    | "login"
    | "logout"
    | "resource_create"
    | "resource_update"
    | "resource_delete"
    | "role_grant"
    | "permission_denied";
  resourceType: string;
  resourceId: string;
  status: "success" | "warning" | "denied";
  metadata?: Record<string, any>;
}

class SpokeOpsClient {
  private appId: string;
  private endpoint: string;
  private token: string;
  private sessionId: string | null = null;
  private currentUser: SpokeUser | null = null;
  private timer: any = null;
  private isActiveCadence = true;

  constructor() {
    this.appId = import.meta.env.VITE_SPOKEOPS_APP_ID || "academy-library";
    this.endpoint = import.meta.env.VITE_SPOKEOPS_ENDPOINT || "https://spokeops-509217.web.app/api/v1/telemetry";
    this.token = import.meta.env.VITE_SPOKEOPS_TOKEN || "spk_live_acadlib_99f2b84";
  }

  public init(user: SpokeUser) {
    if (!this.appId || !this.token) {
      console.warn(`[SpokeOps] Skipping telemetry for ${this.appId || "unknown app"}: missing VITE_SPOKEOPS_APP_ID or VITE_SPOKEOPS_TOKEN.`);
      return;
    }

    this.currentUser = user;
    this.sessionId = `sess_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;

    // 1. Initial Session Ping
    this.sendPing("active");

    // 2. Start Active 2-Minute Heartbeat
    this.startHeartbeat(120000);

    // 3. Tab Visibility Switching (AES v3 Cadence Optimization)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.isActiveCadence = false;
        this.startHeartbeat(300000); // 5 min idle
      } else {
        this.isActiveCadence = true;
        this.startHeartbeat(120000); // 2 min active
        this.sendPing("active");
      }
    });

    // 4. Session Teardown on Navigation / Unload
    window.addEventListener("beforeunload", () => {
      this.closeSession();
    });
  }

  private startHeartbeat(intervalMs: number) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.sendPing(this.isActiveCadence ? "active" : "idle");
    }, intervalMs);
  }

  private sendPing(status: "active" | "idle") {
    if (!this.sessionId || !this.currentUser) return;

    this.dispatch({
      type: "session_heartbeat",
      appId: this.appId,
      sessionId: this.sessionId,
      userId: this.currentUser.uid,
      userEmail: this.currentUser.email,
      userRoles: this.currentUser.roles,
      status,
      clientMetadata: {
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        path: window.location.pathname
      }
    });
  }

  public logAudit(event: AuditEventPayload) {
    if (!this.sessionId || !this.currentUser) return;

    this.dispatch({
      type: "audit_event",
      appId: this.appId,
      sessionId: this.sessionId,
      userId: this.currentUser.uid,
      userEmail: this.currentUser.email,
      roleAtExecution: this.currentUser.roles[0] || "authenticated_user",
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      status: event.status,
      metadata: this.sanitize(event.metadata || {}),
      timestamp: new Date().toISOString()
    });
  }

  public closeSession() {
    if (!this.sessionId || !this.currentUser) return;

    const payload = JSON.stringify({
      type: "session_heartbeat",
      appId: this.appId,
      sessionId: this.sessionId,
      userId: this.currentUser.uid,
      userEmail: this.currentUser.email,
      userRoles: this.currentUser.roles,
      status: "closed"
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      const beaconUrl = `${this.endpoint}?spokeToken=${encodeURIComponent(this.token)}&appId=${encodeURIComponent(this.appId)}`;
      navigator.sendBeacon(beaconUrl, blob);
    } else {
      fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-spoke-token": this.token,
          "x-spoke-app-id": this.appId
        },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }

    if (this.timer) clearInterval(this.timer);
  }

  private dispatch(data: any) {
    fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-spoke-token": this.token,
        "x-spoke-app-id": this.appId
      },
      body: JSON.stringify(data)
    }).catch((err) => {
      console.warn(`[SpokeOps] Failed to emit telemetry payload for ${this.appId}:`, err);
    });
  }

  private sanitize(data: Record<string, any>): Record<string, any> {
    const clean = { ...data };
    const forbidden = ["password", "token", "secret", "apikey", "credential", "auth"];
    for (const key of Object.keys(clean)) {
      if (forbidden.some((f) => key.toLowerCase().includes(f))) {
        clean[key] = "[REDACTED]";
      }
    }
    return clean;
  }
}

export const spokeOps = new SpokeOpsClient();
