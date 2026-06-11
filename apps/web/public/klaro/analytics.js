/* GA4 (gtag.js direct) + Klaro consent + Consent Mode v2 (BossBoard web).
 * Rewritten 2026-05-20 from GTM-PLACEHOLDER to direct gtag.js per Marc-decision
 * (Option A: simpler than GTM container, no GTM admin work needed).
 * Vendor files: /klaro/klaro-no-css.js + /klaro/klaro.min.css (Klaro v0.7.21).
 */
(function () {
  var GA4_ID = "G-83NPHN0QP5";
  var SITE_LABEL = "BossBoard";

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  // Consent Mode v2 — deny analytics until Klaro user-consent updates.
  gtag("consent", "default", {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
    wait_for_update: 500
  });

  // Load gtag.js asynchronously. Pageview deferred until consent grants
  // analytics_storage; on Klaro onAccept we fire an explicit page_view event.
  (function (w, d, s, i) {
    var f = d.getElementsByTagName(s)[0];
    var j = d.createElement(s);
    j.async = true;
    j.src = "https://www.googletagmanager.com/gtag/js?id=" + i;
    f.parentNode.insertBefore(j, f);
  })(window, document, "script", GA4_ID);

  gtag("js", new Date());
  gtag("config", GA4_ID, {
    send_page_view: false  // gated by Klaro consent; explicit page_view in onAccept
  });

  window.klaroConfig = {
    version: 1,
    elementID: "klaro",
    storageMethod: "cookie",
    cookieName: "klaro",
    cookieExpiresAfterDays: 365,
    default: false,
    mustConsent: false,
    acceptAll: true,
    hideDeclineAll: false,
    htmlTexts: true,
    services: [
      {
        name: "google-analytics",
        title: "Google Analytics",
        description:
          "Anonymous analytics so we can understand how users navigate " +
          SITE_LABEL + ".",
        purposes: ["analytics"],
        cookies: [/^_ga/, /^_gid/, /^_gat/],
        // Accept: grant analytics_storage ONLY. Advertising signals
        // (ad_storage / ad_user_data / ad_personalization) stay denied always —
        // BossBoard runs no advertising/remarketing, so opt-in is limited to
        // usage analytics (NZ-privacy-friendly). 2026-06-11: narrowed from the
        // previous all-4 grant which over-collected advertising consent.
        onAccept:
          "gtag('consent','update',{analytics_storage:'granted'});gtag('event','page_view');",
        onDecline:
          // Re-deny all four categories on decline (symmetric safety floor;
          // GDPR/CPRA require declining to revoke any granted consent).
          "gtag('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});"
      }
    ],
    translations: {
      en: {
        consentNotice: {
          title: "Privacy preferences",
          description:
            "We use cookies to understand how this app is used. Choose your preferences below."
        },
        consentModal: {
          title: "Privacy preferences",
          description:
            "We use cookies for product analytics. You can change these preferences at any time."
        },
        purposes: { analytics: "Analytics" }
      }
    }
  };

  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-cf-event]") : null;
    if (!el) return;
    var name = el.getAttribute("data-cf-event");
    if (!name) return;
    var params = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name.indexOf("data-cf-") === 0 && a.name !== "data-cf-event") {
        params[a.name.substring(8).replace(/-/g, "_")] = a.value;
      }
    }
    if (el.tagName === "A" && el.href) params.link_url = el.href;
    var txt = (el.textContent || "").trim();
    if (txt) params.link_text = txt.slice(0, 80);
    try { window.gtag && window.gtag("event", name, params); } catch (_) {}
  });
})();
