function createServiceWorkerRegistration(basePath) {
  return `<script>
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
          navigator.serviceWorker
            .register("${basePath}/service-worker.js", { scope: "${basePath}/" })
            .catch(function (error) {
              console.warn("[pwa] Service worker registration failed", error);
            });
        });
      }
    </script>`;
}

module.exports = { createServiceWorkerRegistration };