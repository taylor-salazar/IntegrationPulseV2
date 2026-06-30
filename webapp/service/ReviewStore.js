sap.ui.define([
	"sap/base/Log"
], function (Log) {
	"use strict";

	// ReviewStore owns local review/resolution state. This is intentionally
	// frontend-only for now; shared multi-user review state should eventually move
	// into a backend table keyed by messageId.
	var RESOLVED_KEY = "integrationPulse.resolvedMessages.v1";
	var REVIEW_KEY = "integrationPulse.underReview.v1";

	function readMap(sKey) {
		try {
			return JSON.parse(window.localStorage.getItem(sKey) || "{}") || {};
		} catch (e) {
			Log.warning("Unable to read review state", e && e.message);
			return {};
		}
	}

	function writeMap(sKey, mValue) {
		try {
			window.localStorage.setItem(sKey, JSON.stringify(mValue || {}));
		} catch (e) {
			Log.warning("Unable to persist review state", e && e.message);
		}
	}

	function reviewKey(sMessageId, sIntegrationId) {
		// Prefer messageId because it identifies a concrete run. Fall back to the
		// integration when a latest run does not exist yet.
		return sMessageId ? "message:" + sMessageId : "integration:" + (sIntegrationId || "");
	}

	return {
		getReviewKey: reviewKey,

		isResolved: function (sMessageId) {
			return !!(sMessageId && readMap(RESOLVED_KEY)[sMessageId]);
		},

		setResolved: function (sMessageId, bResolved) {
			if (!sMessageId) {
				return;
			}
			var mResolved = readMap(RESOLVED_KEY);
			if (bResolved) {
				mResolved[sMessageId] = {
					resolvedAt: new Date().toISOString()
				};
			} else {
				delete mResolved[sMessageId];
			}
			writeMap(RESOLVED_KEY, mResolved);
		},

		countUnresolvedFailed: function (aLogs) {
			// Product decision: only FAILED logs count as unresolved issues. Warnings
			// and processing/retry states are not included in this counter.
			return (aLogs || []).filter(function (oLog) {
				return String(oLog && oLog.status || "").toUpperCase() === "FAILED" &&
					!this.isResolved(oLog.messageId);
			}.bind(this)).length;
		},

		getReview: function (sReviewKey) {
			return sReviewKey ? readMap(REVIEW_KEY)[sReviewKey] || null : null;
		},

		isUnderReview: function (sReviewKey) {
			return !!this.getReview(sReviewKey);
		},

		setReview: function (sReviewKey, sDescription) {
			if (!sReviewKey) {
				return;
			}
			var mReviews = readMap(REVIEW_KEY);
			mReviews[sReviewKey] = {
				description: sDescription || "",
				updatedAt: new Date().toISOString()
			};
			writeMap(REVIEW_KEY, mReviews);
		},

		clearReview: function (sReviewKey) {
			var mReviews = readMap(REVIEW_KEY);
			delete mReviews[sReviewKey];
			writeMap(REVIEW_KEY, mReviews);
		}
	};
});
