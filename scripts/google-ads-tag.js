(function () {
  if (window.__googleAdsTagLoaded) return;
  window.__googleAdsTagLoaded = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };

  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=AW-18133697855";
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", "AW-18133697855");
})();
