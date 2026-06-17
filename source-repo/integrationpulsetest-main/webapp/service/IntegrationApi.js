sap.ui.define([], function () {
  "use strict";

  const BASE = "/api/v1";

  return {

    deployIntegration: async function ({ Id, Version }) {

      const url = `${BASE}/DeployIntegrationDesigntimeArtifact?Id='${encodeURIComponent(Id)}'&Version='${encodeURIComponent(Version)}'`;
      console.log("deployIntegration url:", url);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json"
        }
      });

      if (!res.ok) {
        throw new Error(`Deploy failed: HTTP ${res.status}`);
      }

      return res;
    }

  };
});