sap.ui.define([], function () {
	"use strict";

	var STATUS_STATE = {
		STARTED: "Success",
		STOPPED: "None",
		STARTING: "Warning",
		DEPLOYING: "Warning",
		WARNING: "Warning",
		ERROR: "Error"
	};

	var LOG_STATE = {
		COMPLETED: "Success",
		FAILED: "Error",
		PROCESSING: "Information",
		RETRY: "Warning",
		ESCALATED: "Warning"
	};

	function parseDateValue(sValue) {
		var sText = String(sValue || "");
		var aSapDate = /\/Date\((-?\d+)(?:[+-]\d+)?\)\//.exec(sText);
		if (aSapDate) {
			return new Date(Number(aSapDate[1]));
		}
		return new Date(sValue);
	}

	return {

		/**
		 * Maps a runtime status to a sap.ui.core.ValueState for ObjectStatus colouring.
		 * @param {string} sStatus runtime status (e.g. STARTED)
		 * @returns {string} value state
		 */
		statusState: function (sStatus) {
			if (!sStatus) {
				return "None";
			}
			return STATUS_STATE[sStatus.toUpperCase()] || "None";
		},

		statusIcon: function (sStatus) {
			switch ((sStatus || "").toUpperCase()) {
				case "STARTED":
					return "sap-icon://status-positive";
				case "ERROR":
					return "sap-icon://status-negative";
				case "STARTING":
				case "DEPLOYING":
				case "WARNING":
					return "sap-icon://pending";
				default:
					return "sap-icon://status-inactive";
			}
		},

		/**
		 * Maps a message processing log status to a value state.
		 * @param {string} sStatus log status (e.g. COMPLETED)
		 * @returns {string} value state
		 */
		logState: function (sStatus) {
			if (!sStatus) {
				return "None";
			}
			return LOG_STATE[sStatus.toUpperCase()] || "None";
		},

		/**
		 * Formats an ISO timestamp into a short human readable string.
		 * @param {string} sValue ISO date string
		 * @returns {string} formatted date
		 */
		dateTime: function (sValue) {
			if (!sValue) {
				return "";
			}
			var oDate = parseDateValue(sValue);
			if (isNaN(oDate.getTime())) {
				return sValue;
			}
			return oDate.toLocaleString();
		},

		/**
		 * Formats a duration in milliseconds into e.g. "1.2 s" or "340 ms".
		 * @param {number} iMs duration in milliseconds
		 * @returns {string} formatted duration
		 */
		duration: function (iMs) {
			if (iMs === null || iMs === undefined || iMs === "") {
				return "";
			}
			var n = Number(iMs);
			if (isNaN(n)) {
				return "";
			}
			if (n >= 1000) {
				return (n / 1000).toFixed(1) + " s";
			}
			return Math.round(n) + " ms";
		},

		bytes: function (iBytes) {
			var n = Number(iBytes);
			if (!n || isNaN(n)) {
				return "0 B";
			}
			if (n < 1024) {
				return n + " B";
			}
			if (n < 1024 * 1024) {
				return (n / 1024).toFixed(1) + " KB";
			}
			return (n / (1024 * 1024)).toFixed(1) + " MB";
		},

		/**
		 * Highlights non-zero error counts.
		 * @param {number} iErrors error count
		 * @returns {string} value state
		 */
		errorState: function (iErrors) {
			return Number(iErrors) > 0 ? "Error" : "None";
		},

		formatMessage: function (sText, sValue) {
			return String(sText || "").replace("{0}", sValue || "");
		}
	};
});
