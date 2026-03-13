(function () {
  "use strict";

  var SUPABASE_URL = window.SUPABASE_URL || "";
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";

  var supabaseClient = null;
  if (SUPABASE_URL && SUPABASE_ANON_KEY &&
      !SUPABASE_URL.includes("YOUR-PROJECT-ID") &&
      !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // ── Auth + Role Guard ──
  // Three-layer check:
  // 1. Supabase session exists
  // 2. 2FA is verified (reuses existing verify-login-code)
  // 3. memberships table: role='consultant' + portal_access=true
  //    This is the source of truth — NOT billing_subscriptions.
  function checkAuth() {
    if (!supabaseClient) {
      window.location.replace("./login.html?portal=consultant");
      return;
    }

    supabaseClient.auth.getSession().then(function (result) {
      if (!result.data || !result.data.session) {
        window.location.replace("./login.html?portal=consultant");
        return;
      }

      var session = result.data.session;
      var token = session.access_token;

      // Step 1: Verify 2FA (same mechanism as tradie app)
      fetch("/api/verify-login-code", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ check: true })
      })
        .then(function (r) { return r.json(); })
        .then(function (verifyResult) {
          if (!verifyResult.verified) {
            window.location.replace("./login.html?portal=consultant");
            return;
          }

          // Step 2: Check consultant portal access via memberships (server-side)
          fetch("/api/check-consultant-access", {
            method: "POST",
            headers: { Authorization: "Bearer " + token }
          })
            .then(function (r) { return r.json(); })
            .then(function (accessResult) {
              if (!accessResult.access) {
                if (accessResult.hasPendingInvite) {
                  // Has invite but hasn't completed setup yet
                  window.location.replace("./consultant-setup.html");
                  return;
                }
                showAccessDenied(accessResult.reason || "You do not have consultant portal access.");
                return;
              }

              // Authorized — reveal the page and show portal
              document.body.classList.remove("auth-pending");
              document.body.style.visibility = "visible";
              var portalUserName = document.getElementById("portalUserName");
              if (portalUserName) {
                portalUserName.textContent = accessResult.displayName || session.user.email;
              }
              loadClientData(token, session.user.id);
            })
            .catch(function () {
              showAccessDenied("Unable to verify access. Please try again.");
            });
        })
        .catch(function () {
          window.location.replace("./login.html?portal=consultant");
        });
    });
  }

  function showAccessDenied(message) {
    // Make page visible so user sees the error
    document.body.classList.remove("auth-pending");
    document.body.style.visibility = "visible";
    var container = document.querySelector(".portal-container");
    if (container) {
      container.innerHTML =
        '<div style="text-align:center; padding:60px 20px;">' +
        '<h2 style="color:#ef4444; margin-bottom:12px;">Access Denied</h2>' +
        '<p style="color:#94a3b8;">' + escapeHtml(message) + '</p>' +
        '<p style="margin-top:16px;"><a href="./login.html" style="color:#e75a00; font-weight:700;">Go to login</a></p>' +
        '</div>';
    }
  }

  // Logout
  document.getElementById("portalLogoutBtn").addEventListener("click", function () {
    if (supabaseClient) {
      supabaseClient.auth.signOut().then(function () {
        window.location.replace("./login.html?portal=consultant");
      });
    } else {
      window.location.replace("./login.html?portal=consultant");
    }
  });

  // ── Health signal calculation ──
  // Computes green/amber/red from real metrics:
  //   status (0-1) + tool count (0-1) + recency (0-1) + monthly usage (0-1)
  //   ratio >= 0.65 → green, >= 0.35 → amber, else red
  function computeHealth(client) {
    var score = 0;
    var maxScore = 4;

    if (client.status === "active") score += 1;
    else if (client.status === "trial") score += 0.5;

    if (client.activeTools >= 3) score += 1;
    else if (client.activeTools >= 1) score += 0.5;

    var daysSinceActive = getDaysSince(client.lastActiveDate);
    if (daysSinceActive <= 7) score += 1;
    else if (daysSinceActive <= 30) score += 0.5;

    if (client.usageMonth >= 10) score += 1;
    else if (client.usageMonth >= 3) score += 0.5;

    var ratio = score / maxScore;
    if (ratio >= 0.65) return "green";
    if (ratio >= 0.35) return "amber";
    return "red";
  }

  function getDaysSince(dateStr) {
    if (!dateStr) return 999;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return 999;
    return Math.floor((new Date() - d) / (1000 * 60 * 60 * 24));
  }

  function formatDate(dateStr) {
    if (!dateStr) return "Never";
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Never";
    var days = getDaysSince(dateStr);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return days + " days ago";
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  }

  function getStatusClass(s) {
    if (s === "active") return "active";
    if (s === "trial") return "trial";
    if (s === "needs_setup") return "needs-setup";
    return "inactive";
  }

  function getStatusLabel(s) {
    if (s === "active") return "Active";
    if (s === "trial") return "Trial";
    if (s === "needs_setup") return "Needs Setup";
    return "Inactive";
  }

  function getHealthLabel(h) {
    if (h === "green") return "Healthy";
    if (h === "amber") return "Monitor";
    return "At Risk";
  }

  // ── Load client data from consultant_clients table ──
  function loadClientData(token, consultantId) {
    supabaseClient
      .from("consultant_clients")
      .select("*")
      .eq("consultant_id", consultantId)
      .order("business_name", { ascending: true })
      .then(function (result) {
        if (result.error || !result.data || result.data.length === 0) {
          renderDashboard(getDemoClients());
          return;
        }
        var clients = result.data.map(function (row) {
          return {
            businessName: row.business_name || "Unknown",
            industry: row.industry || "General",
            status: row.status || "inactive",
            activeTools: typeof row.active_tools === "number" ? row.active_tools : 0,
            lastActiveDate: row.last_active_date || null,
            usageWeek: typeof row.usage_week === "number" ? row.usage_week : 0,
            usageMonth: typeof row.usage_month === "number" ? row.usage_month : 0
          };
        });
        renderDashboard(clients);
      });
  }

  function getDemoClients() {
    var today = new Date();
    function daysAgo(n) {
      var d = new Date(today);
      d.setDate(d.getDate() - n);
      return d.toISOString().split("T")[0];
    }
    return [
      { businessName: "Smith Plumbing Co", industry: "Plumbing", status: "active", activeTools: 5, lastActiveDate: daysAgo(1), usageWeek: 12, usageMonth: 47 },
      { businessName: "BrightSpark Electrical", industry: "Electrical", status: "active", activeTools: 4, lastActiveDate: daysAgo(0), usageWeek: 8, usageMonth: 32 },
      { businessName: "Apex Roofing Solutions", industry: "Roofing", status: "trial", activeTools: 2, lastActiveDate: daysAgo(3), usageWeek: 4, usageMonth: 11 },
      { businessName: "GreenScape Landscaping", industry: "Landscaping", status: "active", activeTools: 3, lastActiveDate: daysAgo(5), usageWeek: 3, usageMonth: 15 },
      { businessName: "CoolAir HVAC Services", industry: "HVAC", status: "needs_setup", activeTools: 0, lastActiveDate: null, usageWeek: 0, usageMonth: 0 },
      { businessName: "TrueLevel Carpentry", industry: "Carpentry", status: "active", activeTools: 6, lastActiveDate: daysAgo(0), usageWeek: 15, usageMonth: 58 },
      { businessName: "Precision Painting", industry: "Painting", status: "inactive", activeTools: 0, lastActiveDate: daysAgo(45), usageWeek: 0, usageMonth: 0 },
      { businessName: "SafeGuard Security", industry: "Security", status: "trial", activeTools: 1, lastActiveDate: daysAgo(8), usageWeek: 1, usageMonth: 4 },
      { businessName: "QuickFix Handyman", industry: "General Trades", status: "active", activeTools: 3, lastActiveDate: daysAgo(2), usageWeek: 6, usageMonth: 22 },
      { businessName: "Solid Foundations Concreting", industry: "Concreting", status: "needs_setup", activeTools: 0, lastActiveDate: daysAgo(14), usageWeek: 0, usageMonth: 1 }
    ];
  }

  // ── Render ──
  var allClients = [];

  function renderDashboard(clients) {
    allClients = clients;
    clients.forEach(function (c) { c.health = computeHealth(c); });

    var activeCount = clients.filter(function (c) { return c.status === "active"; }).length;
    var inactiveCount = clients.filter(function (c) { return c.status === "inactive"; }).length;
    var totalTools = clients.reduce(function (sum, c) { return sum + c.activeTools; }, 0);

    var attentionSet = {};
    clients.forEach(function (c) {
      if (c.status === "trial" || c.status === "needs_setup" || c.health === "amber" || c.health === "red") {
        attentionSet[c.businessName] = true;
      }
    });

    document.getElementById("totalClients").textContent = clients.length;
    document.getElementById("activeClients").textContent = activeCount;
    document.getElementById("attentionClients").textContent = Object.keys(attentionSet).length;
    document.getElementById("inactiveClients").textContent = inactiveCount;
    document.getElementById("totalActiveTools").textContent = totalTools;

    renderTable(clients);
  }

  function renderTable(clients) {
    var tbody = document.getElementById("clientTableBody");
    if (clients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><p>No clients found.</p></div></td></tr>';
      return;
    }

    var html = "";
    clients.forEach(function (c) {
      var statusClass = getStatusClass(c.status);
      var healthColor = c.health || computeHealth(c);
      var maxUsage = 60;
      var usagePct = Math.min(100, Math.round((c.usageMonth / maxUsage) * 100));
      var usageBarColor = usagePct >= 50 ? "green" : usagePct >= 20 ? "amber" : "red";

      html += '<tr>';
      html += '<td><span class="business-name">' + escapeHtml(c.businessName) + '</span></td>';
      html += '<td><span class="industry-tag">' + escapeHtml(c.industry) + '</span></td>';
      html += '<td><span class="status-badge ' + statusClass + '"><span class="status-dot"></span>' + getStatusLabel(c.status) + '</span></td>';
      html += '<td>' + c.activeTools + '</td>';
      html += '<td>' + formatDate(c.lastActiveDate) + '</td>';
      html += '<td>' + c.usageMonth + ' uses';
      html += '<div class="usage-bar-wrap"><div class="usage-bar ' + usageBarColor + '" style="width:' + usagePct + '%"></div></div>';
      html += '</td>';
      html += '<td><span class="health-signal ' + healthColor + '"><span class="health-dot ' + healthColor + '"></span>' + getHealthLabel(healthColor) + '</span></td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Search ──
  var searchInput = document.getElementById("clientSearch");
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      var query = searchInput.value.toLowerCase().trim();
      if (!query) { renderTable(allClients); return; }
      var filtered = allClients.filter(function (c) {
        return c.businessName.toLowerCase().indexOf(query) !== -1 ||
               c.industry.toLowerCase().indexOf(query) !== -1 ||
               c.status.toLowerCase().indexOf(query) !== -1;
      });
      renderTable(filtered);
    });
  }

  checkAuth();
})();
