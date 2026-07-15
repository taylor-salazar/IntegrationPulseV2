sap.ui.define([], function () {
	"use strict";

	/**
	 * Single source of truth for runtime wiring.
	 *
	 *  useMock      - false => the UI uses liveMode. This is the BTP import default.
	 *                 true  => the UI reads from webapp/localService/mockdata/*.json
	 *  liveMode     - "destination" => call /api/v1 through BTP/UI5 destination routing
	 *                 "proxy"       => call the FastAPI proxy at backendBaseUrl
	 *  destinationBaseUrl - same-origin BTP destination route for SAP Integration Suite
	 *  immediateRunBaseUrl - same-origin route for HTTPS sender endpoints. When an
	 *                        IntegrationRuntimeArtifact endpoint is "/http/...",
	 *                        leave this empty so the endpoint is called as-is.
	 *  payloadBaseUrl - custom payload service route. In BTP, route this to the
	 *                   payload receiver service, not the Integration Suite destination.
	 *  backendBaseUrl - base URL of the optional FastAPI proxy (see ../../backend).
	 *
	 * Runtime overrides:
	 *   ?mock=true               uses local mock data
	 *   ?mock=false              uses config.liveMode
	 *   ?mock=false&api=proxy    uses FastAPI proxy
	 *   ?mock=false&api=destination uses BTP destination routing
	 */
	return {
		useMock: false,
		liveMode: "destination",
		destinationBaseUrl: "/api/v1",
		immediateRunBaseUrl: "",
		payloadBaseUrl: "/payload-api/v1",
		backendBaseUrl: "http://localhost:8000"
	};
});
