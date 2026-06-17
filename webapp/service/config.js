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
		payloadBaseUrl: "/payload-api/v1",
		backendBaseUrl: "http://localhost:8000"
	};
});
