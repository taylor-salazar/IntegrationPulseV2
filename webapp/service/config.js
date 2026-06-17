sap.ui.define([], function () {
	"use strict";

	/**
	 * Single source of truth for runtime wiring.
	 *
	 *  useMock      - true  => the UI reads from webapp/localService/mockdata/*.json
	 *                 false => the UI uses liveMode
	 *  liveMode     - "destination" => call /api/v1 through BTP/UI5 destination routing
	 *                 "proxy"       => call the FastAPI proxy at backendBaseUrl
	 *  destinationBaseUrl - same-origin BTP destination route for SAP Integration Suite
	 *  backendBaseUrl - base URL of the optional FastAPI proxy (see ../../backend).
	 *
	 * Runtime overrides:
	 *   ?mock=false              uses config.liveMode
	 *   ?mock=false&api=proxy    uses FastAPI proxy
	 *   ?mock=false&api=destination uses BTP destination routing
	 *
	 * >>> This is the ONE place your colleague flips to go from demo to live. <<<
	 */
	return {
		useMock: true,
		liveMode: "destination",
		destinationBaseUrl: "/api/v1",
		backendBaseUrl: "http://localhost:8000"
	};
});
