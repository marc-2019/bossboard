/* GA4 + Klaro consent + Consent Mode v2 (BossBoard web)
 * Replace GTM_ID below with the real container ID from GA4 admin once provisioned.
 * Vendor files: /klaro/klaro-no-css.js + /klaro/klaro.min.css (Klaro v0.7.21).
 */
(function () {
  var GTM_ID = "GTM-PLACEHOLDER";
  var SITE_LABEL = "BossBoard";

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag("consent", "default", {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
    wait_for_update: 500
  });

  (function (w, d, s, l, i) {
    w[l] = w[l] || [];
    w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
    var f = d.getElementsByTagName(s)[0],
        j = d.createElement(s),
        dl = l !== "dataLayer" ? "&l=" + l : "";
    j.async = true;
    j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;
    f.parentNode.insertBefore(j, f);
  })(window, document, "script", "dataLayer", GTM_ID);

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
        onAccept:
          "gtag('consent','update',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});",
        onDecline:
          "gtag('consent','update',{analytics_storage:'denied'});"
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
})();
