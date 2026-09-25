sap.ui.define([], function () {
	"use strict";

    // Production uses only same-origin FastAPI routes. URL mode switches are
    // ignored. scripts/prepare-development.cjs creates a separate ignored tree
    // for local mock/destination comparison without altering this config.
	return {
        production: true,
        useMock: false,
        liveMode: "proxy",
        destinationBaseUrl: "/api/v1",
        immediateRunBaseUrl: "",
        payloadBaseUrl: "./payload-api/v1",
        backendBaseUrl: "."
    };
});
