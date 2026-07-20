sap.ui.define([
	"sap/base/Log",
	"integrationpulse/service/config"
], function (Log, config) {
	"use strict";

	// BackendClient is the frontend's data access boundary. Controllers call this
	// service instead of using fetch directly, so mock, destination, and proxy
	// modes can share one normalized API.

	// Resolve mock mode: ?mock=false overrides config.useMock at runtime.
	function resolveUseMock() {
		var sParam = new URLSearchParams(window.location.search).get("mock");
		if (sParam === "false") {
			return false;
		}
		if (sParam === "true") {
			return true;
		}
		return config.useMock;
	}

	function resolveLiveMode() {
		var sParam = new URLSearchParams(window.location.search).get("api");
		if (sParam === "proxy" || sParam === "destination") {
			return sParam;
		}
		return config.liveMode || "proxy";
	}

	var USE_MOCK = resolveUseMock();
	var LIVE_MODE = resolveLiveMode();
	var MOCK_ROOT = sap.ui.require.toUrl("integrationpulse/localService/mockdata");
	var DESIGN_TIME_CACHE_KEY = "integrationPulse.designTimeMetadata.v1";
	var mDesignTimeMetadataCache = {};

	function loadDesignTimeMetadataCache() {
		try {
			mDesignTimeMetadataCache = JSON.parse(window.localStorage.getItem(DESIGN_TIME_CACHE_KEY) || "{}") || {};
		} catch (e) {
			mDesignTimeMetadataCache = {};
		}
	}

	function persistDesignTimeMetadataCache() {
		try {
			window.localStorage.setItem(DESIGN_TIME_CACHE_KEY, JSON.stringify(mDesignTimeMetadataCache));
		} catch (e) {
			Log.warning("Unable to persist design-time metadata cache", e && e.message);
		}
	}

	loadDesignTimeMetadataCache();

	function delay(ms) {
		return new Promise(function (resolve) {
			setTimeout(resolve, ms);
		});
	}

	function getJSON(sUrl) {
		// Thin GET wrapper used by every data-loading method. It converts HTTP
		// failures into thrown Error objects so controllers can show one message
		// path regardless of the backing API.
		return fetch(sUrl, {
			headers: { "Accept": "application/json" },
			credentials: "include"
		}).then(function (res) {
			if (!res.ok) {
				return res.text().then(function (t) {
					throw new Error(t || (res.status + " " + res.statusText));
				});
			}
			return res.json();
		});
	}

	function sendJSON(sUrl, sMethod, oBody) {
		return fetch(sUrl, {
			method: sMethod,
			headers: {
				"Accept": "application/json",
				"Content-Type": "application/json"
			},
			credentials: "include",
			body: oBody ? JSON.stringify(oBody) : undefined
		}).then(function (res) {
			if (!res.ok) {
				return res.text().then(function (t) {
					throw new Error(t || (res.status + " " + res.statusText));
				});
			}
			if (res.status === 204) {
				return {};
			}
			return res.text().then(function (t) {
				return t ? JSON.parse(t) : {};
			});
		});
	}

	function assertBatchSucceeded(sBody) {
		if (/HTTP\/1\.1\s+[45]\d\d/.test(sBody || "")) {
			throw new Error("Batch update failed: " + sBody);
		}
	}

	function sendText(sUrl, sMethod, sBody, mHeaders) {
		return fetch(sUrl, {
			method: sMethod,
			headers: mHeaders || {},
			credentials: "include",
			body: sBody
		}).then(function (res) {
			if (!res.ok) {
				return res.text().then(function (t) {
					throw new Error(t || (res.status + " " + res.statusText));
				});
			}
			return res.text().then(function (t) {
				assertBatchSucceeded(t);
				return { raw: t };
			});
		});
	}

	function odataString(sValue) {
		return String(sValue || "").replace(/'/g, "''");
	}

	function odataLiteral(sValue) {
		return "'" + encodeURIComponent(odataString(sValue)) + "'";
	}

	function odataResults(oData) {
		return (oData && oData.d && oData.d.results) || [];
	}

	function odataEntity(oData) {
		return (oData && oData.d) || oData || {};
	}

	function mapIntegration(oRaw) {
		// Normalize Integration Suite/runtime/mock shapes into the field names the
		// UI expects. The rest of the app should not care whether the source used
		// Id, id, Name, Sender, SourceSystem, etc.
		return {
			id: oRaw.Id || oRaw.id || "",
			name: oRaw.Name || oRaw.name || oRaw.Id || oRaw.id || "",
			designTimeId: oRaw.IntegrationDesigntimeArtifactId || oRaw.DesigntimeArtifactId ||
				oRaw.DesignTimeArtifactId || oRaw.ArtifactId || oRaw.Name || oRaw.Id || oRaw.id || "",
			isRuntimeArtifact: oRaw.isRuntimeArtifact !== false,
			sender: oRaw.Sender || oRaw.sender || oRaw.SourceSystem || oRaw.sourceSystem || oRaw.Source || oRaw.source || "",
			receiver: oRaw.Receiver || oRaw.receiver || oRaw.TargetSystem || oRaw.targetSystem || oRaw.Target || oRaw.target || "",
			packageName: oRaw.PackageId || oRaw.PackageName || oRaw.packageName || "",
			version: oRaw.Version || oRaw.version || "",
			status: oRaw.Status || oRaw.status || "STOPPED",
			endpoint: oRaw.Endpoint || oRaw.endpoint || oRaw.Url || oRaw.url || "",
			description: oRaw.Description || oRaw.description || "",
			parameterCount: oRaw.parameterCount || 0,
			lastDeployed: oRaw.DeployedOn || oRaw.LastDeployedOn || oRaw.lastDeployed || null
		};
	}

	function mapDesignTimeMetadata(oRaw) {
		return {
			id: oRaw.Id || oRaw.id || "",
			name: oRaw.Name || oRaw.name || "",
			packageName: oRaw.PackageId || oRaw.PackageName || oRaw.packageName || "",
			designTimeVersion: oRaw.Version || oRaw.version || "",
			sender: oRaw.Sender || oRaw.sender || "",
			receiver: oRaw.Receiver || oRaw.receiver || ""
		};
	}

	function runtimeArtifactsOnly(aItems) {
		return (aItems || []).filter(function (oItem) {
			return oItem && oItem.id && oItem.isRuntimeArtifact !== false;
		});
	}

	function mapConfiguration(oRaw) {
		return {
			key: oRaw.ParameterKey || oRaw.key || "",
			label: oRaw.ParameterKey || oRaw.label || oRaw.key || "",
			value: oRaw.ParameterValue || oRaw.value || "",
			defaultValue: oRaw.DefaultValue || oRaw.defaultValue || "",
			dataType: oRaw.DataType || oRaw.dataType || "xsd:string",
			secure: !!(oRaw.Secure || oRaw.secure),
			readOnly: !!(oRaw.ReadOnly || oRaw.readOnly)
		};
	}

	function mapMessageLog(oRaw) {
		// Normalize Message Processing Log records. The UI treats messageId as the
		// identity of a single run, which is why review/resolution features key off it.
		return {
			messageId: oRaw.MessageGuid || oRaw.MessageId || oRaw.messageId || "",
			status: oRaw.Status || oRaw.status || "",
			sender: oRaw.Sender || oRaw.sender || "",
			logEnd: oRaw.LogEnd || oRaw.logEnd || null,
			durationMs: oRaw.Duration || oRaw.durationMs || 0,
			errorMessage: oRaw.CustomStatus || oRaw.ErrorMessage || oRaw.errorMessage || ""
		};
	}

	function visibleMessageLogs(aLogs) {
		return (aLogs || []).filter(function (oLog) {
			return String(oLog && oLog.status || "").toUpperCase() !== "DISCARDED";
		});
	}

	function mapPayload(oRaw) {
		return {
			id: oRaw.id || "",
			integrationId: oRaw.integrationId || "",
			messageId: oRaw.messageId || "",
			fileName: oRaw.fileName || "payload.txt",
			contentType: oRaw.contentType || "text/plain",
			sizeBytes: oRaw.sizeBytes || 0,
			createdAt: oRaw.createdAt || null,
			expiresAt: oRaw.expiresAt || null,
			previewAvailable: oRaw.previewAvailable !== false,
			downloadOnly: !!oRaw.downloadOnly,
			payload: oRaw.payload
		};
	}

	function getPayloadUrl(sPath) {
		return (config.payloadBaseUrl || "/payload-api/v1") + sPath;
	}

	function joinUrl(sBase, sPath) {
		if (!sPath) {
			return "";
		}
		if (/^https?:\/\//i.test(sPath)) {
			return sPath;
		}
		var sNormalizedBase = String(sBase || "").replace(/\/$/, "");
		var sNormalizedPath = String(sPath).charAt(0) === "/" ? String(sPath) : "/" + sPath;
		return sNormalizedBase + sNormalizedPath;
	}

	function normalizeImmediateRunEndpoint(sEndpoint) {
		var sPath = String(sEndpoint || "").trim();
		if (!sPath || /^https?:\/\//i.test(sPath) || sPath.indexOf("/http/") === 0 || sPath === "/http") {
			return sPath;
		}
		return "/http/" + sPath.replace(/^\/+/, "");
	}

	function getImmediateRunUrl(sEndpoint) {
		return joinUrl(config.immediateRunBaseUrl || "", normalizeImmediateRunEndpoint(sEndpoint));
	}

	function getDestinationUrl(sPath) {
		return (config.destinationBaseUrl || "/api/v1") + sPath;
	}

	function getDesignTimeEntityForCandidate(sDesignTimeId, sVersion) {
		var sPath = "/IntegrationDesigntimeArtifacts(Id=" + odataLiteral(sDesignTimeId) +
			",Version=" + odataLiteral(sVersion) + ")";
		return getJSON(getDestinationUrl(sPath)).then(function (d) {
			return mapDesignTimeMetadata(odataEntity(d));
		});
	}

	function uniqueValues(aValues) {
		var mSeen = {};
		return aValues.filter(function (sValue) {
			if (!sValue || mSeen[sValue]) {
				return false;
			}
			mSeen[sValue] = true;
			return true;
		});
	}

	function getDesignTimeVersionCandidates(oIntegration) {
		return uniqueValues([
			"Active",
			"active",
			oIntegration && oIntegration.version
		]);
	}

	function getDesignTimeIdCandidates(sId, oIntegration) {
		return uniqueValues([
			oIntegration && oIntegration.designTimeId,
			sId,
			oIntegration && oIntegration.name
		]);
	}

	function getDesignTimeCacheKey(oIntegration) {
		return [
			oIntegration && oIntegration.id,
			oIntegration && oIntegration.version,
			oIntegration && oIntegration.designTimeId
		].join("|");
	}

	function applyCachedDesignTimeMetadata(oIntegration) {
		var oCached = mDesignTimeMetadataCache[getDesignTimeCacheKey(oIntegration)];
		return oCached ? Object.assign({}, oIntegration, oCached) : oIntegration;
	}

	function hasCachedDesignTimeMetadata(oIntegration) {
		return !!mDesignTimeMetadataCache[getDesignTimeCacheKey(oIntegration)];
	}

	function tryGetDesignTimeMetadata(aIds, aVersions, iIdIndex, iVersionIndex) {
		if (iIdIndex >= aIds.length) {
			return Promise.resolve(null);
		}
		if (iVersionIndex >= aVersions.length) {
			return tryGetDesignTimeMetadata(aIds, aVersions, iIdIndex + 1, 0);
		}
		return getDesignTimeEntityForCandidate(aIds[iIdIndex], aVersions[iVersionIndex]).catch(function () {
			return tryGetDesignTimeMetadata(aIds, aVersions, iIdIndex, iVersionIndex + 1);
		});
	}

	function withDesignTimeMetadata(oRuntimeItem) {
		var sCacheKey = getDesignTimeCacheKey(oRuntimeItem);
		if (mDesignTimeMetadataCache[sCacheKey]) {
			return Promise.resolve(Object.assign({}, oRuntimeItem, mDesignTimeMetadataCache[sCacheKey]));
		}
		return tryGetDesignTimeMetadata(
			getDesignTimeIdCandidates(oRuntimeItem.id, oRuntimeItem),
			getDesignTimeVersionCandidates(oRuntimeItem),
			0,
			0
		).then(function (oDesignTimeItem) {
			if (!oDesignTimeItem) {
				return Object.assign({}, oRuntimeItem, {
					sender: "",
					receiver: ""
				});
			}
			mDesignTimeMetadataCache[sCacheKey] = {
				designTimeId: oDesignTimeItem.id || oRuntimeItem.designTimeId,
				designTimeVersion: oDesignTimeItem.designTimeVersion || oRuntimeItem.designTimeVersion,
				sender: oDesignTimeItem.sender || "",
				receiver: oDesignTimeItem.receiver || "",
				packageName: oRuntimeItem.packageName || oDesignTimeItem.packageName,
				name: oRuntimeItem.name || oDesignTimeItem.name || oRuntimeItem.id
			};
			persistDesignTimeMetadataCache();
			return Object.assign({}, oRuntimeItem, mDesignTimeMetadataCache[sCacheKey]);
		});
	}

	function enrichDesignTimeMetadataQueue(aItems) {
		var aQueue = (aItems || []).slice();
		var aResults = aQueue.slice();
		var iNext = 0;
		var iConcurrency = 6;
		var fnRunNext = function () {
			if (iNext >= aQueue.length) {
				return Promise.resolve();
			}
			var oItem = aQueue[iNext];
			var iItemIndex = iNext;
			iNext += 1;
			return withDesignTimeMetadata(oItem).then(function (oEnriched) {
				aResults[iItemIndex] = oEnriched || oItem;
			}).catch(function () {
				aResults[iItemIndex] = oItem;
			}).then(fnRunNext);
		};
		return Promise.all(Array(Math.min(iConcurrency, aQueue.length)).fill(0).map(fnRunNext)).then(function () {
			return aResults;
		});
	}

	function getDestinationIntegrations() {
		return getJSON(getDestinationUrl("/IntegrationRuntimeArtifacts")).then(function (d) {
			return runtimeArtifactsOnly(odataResults(d).map(mapIntegration));
		});
	}

	function getDestinationIntegration(sId) {
		return getDestinationIntegrations().then(function (aItems) {
			var oItem = aItems.filter(function (o) { return o.id === sId; })[0] || null;
			return oItem ? withDesignTimeMetadata(oItem) : null;
		});
	}

	function getConfigurationsForCandidate(sDesignTimeId, sVersion) {
		var sPath = "/IntegrationDesigntimeArtifacts(Id=" + odataLiteral(sDesignTimeId) +
			",Version=" + odataLiteral(sVersion) + ")/Configurations";
		return getJSON(getDestinationUrl(sPath)).then(function (d) {
			return odataResults(d).map(mapConfiguration);
		});
	}

	function tryGetConfigurations(aCandidates, sVersion, iIndex) {
		if (iIndex >= aCandidates.length) {
			return Promise.reject(new Error("Integration design time artifact not found"));
		}
		return getConfigurationsForCandidate(aCandidates[iIndex], sVersion).catch(function () {
			return tryGetConfigurations(aCandidates, sVersion, iIndex + 1);
		});
	}

	function getDestinationConfigurations(sId) {
		return tryGetConfigurations([sId], "Active", 0);
	}

	function updateDestinationConfigurations(sId, aConfigurations) {
		if (!aConfigurations || !aConfigurations.length) {
			return Promise.resolve({ id: sId, updated: 0 });
		}
		var sBatchBoundary = "batch_" + Date.now();
		var sChangeSetBoundary = "all_parameters";
		var aLines = [
			"--" + sBatchBoundary,
			"Content-Type: multipart/mixed; boundary=" + sChangeSetBoundary,
			""
		];
		aConfigurations.forEach(function (oConfig) {
			var sPath = "/IntegrationDesigntimeArtifacts(Id=" + odataLiteral(sId) +
				",Version=" + odataLiteral("Active") + ")/$links/Configurations(" +
				odataLiteral(oConfig.key) + ")";
			aLines = aLines.concat([
				"--" + sChangeSetBoundary,
				"Content-Type: application/http",
				"Content-Transfer-Encoding: binary",
				"",
				"PUT " + sPath.slice(1) + " HTTP/1.1",
				"Accept: application/json",
				"Content-Type: application/json",
				"",
				JSON.stringify({
					ParameterKey: oConfig.key,
					ParameterValue: oConfig.value,
					DataType: oConfig.dataType || "xsd:string"
				}),
				""
			]);
		});
		aLines = aLines.concat([
			"--" + sChangeSetBoundary + "--",
			"--" + sBatchBoundary + "--",
			""
		]);
		return sendText(getDestinationUrl("/$batch"), "POST", aLines.join("\r\n"), {
			"Accept": "application/json",
			"Content-Type": "multipart/mixed; boundary=" + sBatchBoundary
		}).then(function () {
			return { id: sId, updated: aConfigurations.length };
		});
	}

	function deployDestinationIntegration(sId, aConfigurations) {
		return updateDestinationConfigurations(sId, aConfigurations).then(function () {
			var sPath = "/DeployIntegrationDesigntimeArtifact?Id=" + odataLiteral(sId) +
				"&Version=" + odataLiteral("Active");
			return fetch(getDestinationUrl(sPath), {
				method: "POST",
				headers: { "Accept": "application/json" },
				credentials: "include"
			}).then(function (res) {
				if (!res.ok) {
					return res.text().then(function (t) {
						throw new Error(t || (res.status + " " + res.statusText));
					});
				}
				return { id: sId, status: "STARTING", taskId: null };
			});
		});
	}

	function triggerDestinationIntegration(oIntegration) {
		var oRunOptions = arguments.length > 1 && arguments[1] ? arguments[1] : {};
		var sEndpoint = oRunOptions.endpoint || (oIntegration && oIntegration.endpoint);
		var sUrl = getImmediateRunUrl(sEndpoint);
		var mHeaders = {
			"Accept": "application/json",
			"Content-Type": "application/json"
		};
		if (!sUrl) {
			return Promise.reject(new Error("No HTTPS sender endpoint is available for this integration."));
		}
		if (oRunOptions.entity) {
			mHeaders["pulse.entity"] = oRunOptions.entity;
			mHeaders["X-Pulse-Entity"] = oRunOptions.entity;
		}
		if (oRunOptions.filterQuery) {
			mHeaders["filter.query"] = oRunOptions.filterQuery;
		}
		return fetch(sUrl, {
			method: "POST",
			headers: mHeaders,
			credentials: "include",
			body: "{}"
		}).then(function (res) {
			if (!res.ok) {
				return res.text().then(function (t) {
					throw new Error(t || (res.status + " " + res.statusText));
				});
			}
			return {
				id: oIntegration.id,
				status: "TRIGGERED",
				message: "Immediate run request sent."
			};
		});
	}

	/**
	 * Thin client over Integration Pulse data sources:
	 * mock fixtures, destination live mode, and optional FastAPI proxy mode.
	 */
	return {

		isMock: function () {
			return USE_MOCK;
		},

		getLiveMode: function () {
			return LIVE_MODE;
		},

		enrichIntegrationMetadata: function (oIntegration) {
			if (USE_MOCK || LIVE_MODE !== "destination") {
				return Promise.resolve(oIntegration);
			}
			return withDesignTimeMetadata(oIntegration);
		},

		applyCachedIntegrationMetadata: function (oIntegration) {
			return applyCachedDesignTimeMetadata(oIntegration);
		},

		hasCachedIntegrationMetadata: function (oIntegration) {
			return USE_MOCK || LIVE_MODE !== "destination" || hasCachedDesignTimeMetadata(oIntegration);
		},

		/**
		 * List deployed integrations.
		 * Destination live: GET /api/v1/IntegrationRuntimeArtifacts
		 * Proxy live: GET {backend}/api/integrations
		 */
		getIntegrations: function () {
			if (USE_MOCK) {
				return getJSON(MOCK_ROOT + "/integrations.json").then(function (d) {
					return delay(250).then(function () { return runtimeArtifactsOnly((d.value || []).map(mapIntegration)); });
				});
			}
			if (LIVE_MODE === "destination") {
				return getDestinationIntegrations();
			}
			return getJSON(config.backendBaseUrl + "/api/integrations").then(function (aItems) {
				return runtimeArtifactsOnly((aItems || []).map(mapIntegration));
			});
		},

		getIntegrationsWithMetadata: function () {
			return this.getIntegrations().then(function (aItems) {
				var aRuntimeItems = (aItems || []).map(applyCachedDesignTimeMetadata);
				if (USE_MOCK || LIVE_MODE !== "destination" || aRuntimeItems.every(hasCachedDesignTimeMetadata)) {
					return aRuntimeItems;
				}
				return enrichDesignTimeMetadataQueue(aRuntimeItems);
			});
		},

		/**
		 * Get a single integration's metadata.
		 */
		getIntegration: function (sId) {
			if (USE_MOCK) {
				return this.getIntegrations().then(function (aItems) {
					return aItems.filter(function (o) { return o.id === sId; })[0] || null;
				});
			}
			if (LIVE_MODE === "destination") {
				return getDestinationIntegration(sId);
			}
			return getJSON(config.backendBaseUrl + "/api/integrations/" + encodeURIComponent(sId));
		},

		/**
		 * Get the externalized parameters of an integration.
		 * Destination live: GET /api/v1/IntegrationDesigntimeArtifacts(...)/Configurations
		 * Proxy live: GET {backend}/api/integrations/{id}/configurations
		 */
		getConfigurations: function (sId) {
			if (USE_MOCK) {
				return getJSON(MOCK_ROOT + "/configurations.json").then(function (d) {
					return delay(250).then(function () {
						return d[sId] || [];
					});
				});
			}
			if (LIVE_MODE === "destination") {
				return getDestinationConfigurations(sId);
			}
			return getJSON(config.backendBaseUrl + "/api/integrations/" + encodeURIComponent(sId) + "/configurations");
		},

		/**
		 * Persist edited parameters (draft) for an integration.
		 * Destination live: PUT /api/v1/IntegrationDesigntimeArtifacts(...)/$links/Configurations(...)
		 * Proxy live: PUT {backend}/api/integrations/{id}/configurations
		 */
		updateConfigurations: function (sId, aConfigurations) {
			if (USE_MOCK) {
				return delay(300).then(function () {
					return { id: sId, updated: aConfigurations.length };
				});
			}
			if (LIVE_MODE === "destination") {
				return updateDestinationConfigurations(sId, aConfigurations);
			}
			return sendJSON(
				config.backendBaseUrl + "/api/integrations/" + encodeURIComponent(sId) + "/configurations",
				"PUT",
				{ configurations: aConfigurations }
			);
		},

		/**
		 * Deploy / redeploy an integration to the runtime.
		 * Destination live: POST /api/v1/DeployIntegrationDesigntimeArtifact
		 * Proxy live: POST {backend}/api/integrations/{id}/deploy
		 */
		deployIntegration: function (sId, aConfigurations) {
			if (USE_MOCK) {
				Log.info("[mock] deploy " + sId, JSON.stringify(aConfigurations));
				return delay(1200).then(function () {
					return { id: sId, status: "STARTING", taskId: "mock-task-" + sId };
				});
			}
			if (LIVE_MODE === "destination") {
				return deployDestinationIntegration(sId, aConfigurations);
			}
			return sendJSON(
				config.backendBaseUrl + "/api/integrations/" + encodeURIComponent(sId) + "/deploy",
				"POST",
				{ configurations: aConfigurations }
			);
		},

		/**
		 * Trigger the separate HTTPS sender endpoint for an immediate run.
		 * This intentionally does not update timer parameters or redeploy the artifact.
		 */
		triggerImmediateRun: function (oIntegration, oRunOptions) {
			var sId = (oIntegration && oIntegration.id) || String(oIntegration || "");
			if (USE_MOCK) {
				Log.info("[mock] trigger immediate run " + sId, JSON.stringify(oRunOptions || {}));
				return delay(700).then(function () {
					return { id: sId, status: "TRIGGERED", message: "Mock immediate run started." };
				});
			}
			if (LIVE_MODE === "destination") {
				return triggerDestinationIntegration(oIntegration || { id: sId }, oRunOptions || {});
			}
			return sendJSON(
				config.backendBaseUrl + "/api/integrations/" + encodeURIComponent(sId) + "/trigger",
				"POST",
				Object.assign({ endpoint: oIntegration && oIntegration.endpoint }, oRunOptions || {})
			);
		},

		/**
		 * List runtime status for all integrations (Monitoring master).
		 * Destination live: GET /api/v1/IntegrationRuntimeArtifacts
		 * Proxy live: GET {backend}/api/monitoring
		 */
		getMonitoring: function () {
			if (USE_MOCK) {
				return getJSON(MOCK_ROOT + "/runtimeStatus.json").then(function (d) {
					return delay(250).then(function () { return d.value; });
				});
			}
			if (LIVE_MODE === "destination") {
				return getDestinationIntegrations().then(function (aItems) {
					return aItems.map(function (o) {
						var oWithMetadata = applyCachedDesignTimeMetadata(o);
						return {
							id: oWithMetadata.id,
							name: oWithMetadata.name,
							packageName: oWithMetadata.packageName,
							sender: oWithMetadata.sender,
							receiver: oWithMetadata.receiver,
							endpoint: "",
							status: oWithMetadata.status,
							messages24h: 0,
							errors24h: 0,
							lastDeployed: oWithMetadata.lastDeployed
						};
					});
				});
			}
			return getJSON(config.backendBaseUrl + "/api/monitoring");
		},

		getMonitoringItem: function (sId) {
			if (USE_MOCK) {
				return this.getMonitoring().then(function (aItems) {
					return aItems.filter(function (o) { return o.id === sId; })[0] || null;
				});
			}
			if (LIVE_MODE === "destination") {
				return this.getMonitoring().then(function (aItems) {
					return aItems.filter(function (o) { return o.id === sId; })[0] || null;
				});
			}
			return getJSON(config.backendBaseUrl + "/api/monitoring/" + encodeURIComponent(sId));
		},

		/**
		 * Message processing logs for one integration (Monitoring detail).
		 * Destination live: GET /api/v1/MessageProcessingLogs?$filter=...
		 * Proxy live: GET {backend}/api/monitoring/{id}/logs
		 */
		getMessageLogs: function (sId) {
			if (USE_MOCK) {
				return getJSON(MOCK_ROOT + "/messageLogs.json").then(function (d) {
					return delay(250).then(function () {
						return visibleMessageLogs(d[sId] || []);
					});
				});
			}
			if (LIVE_MODE === "destination") {
				var sFilter = encodeURIComponent("IntegrationFlowName eq '" + odataString(sId) + "'");
				var sPath = "/MessageProcessingLogs?$filter=" + sFilter +
					"&$orderby=LogEnd%20desc&$top=50&$format=json";
				return getJSON(getDestinationUrl(sPath)).then(function (d) {
					return visibleMessageLogs(odataResults(d).map(mapMessageLog));
				});
			}
			return getJSON(config.backendBaseUrl + "/api/monitoring/" + encodeURIComponent(sId) + "/logs")
				.then(visibleMessageLogs);
		},

		getPayloads: function (sIntegrationId) {
			if (USE_MOCK) {
				return getJSON(MOCK_ROOT + "/payloads.json").then(function (d) {
					return delay(200).then(function () {
						return (d[sIntegrationId] || []).map(mapPayload);
					});
				});
			}
			return getJSON(
				getPayloadUrl("/payloads?integrationId=" + encodeURIComponent(sIntegrationId))
			).then(function (aItems) {
				return (aItems || []).map(mapPayload);
			});
		},

		getPayload: function (sPayloadId) {
			if (USE_MOCK) {
				return getJSON(MOCK_ROOT + "/payloads.json").then(function (d) {
					var aGroups = Object.keys(d).map(function (sKey) { return d[sKey]; });
					var aAll = Array.prototype.concat.apply([], aGroups);
					var oItem = aAll.filter(function (o) { return o.id === sPayloadId; })[0];
					return delay(150).then(function () {
						return oItem ? mapPayload(oItem) : null;
					});
				});
			}
			return getJSON(getPayloadUrl("/payloads/" + encodeURIComponent(sPayloadId))).then(mapPayload);
		},

		getPayloadDownloadUrl: function (sPayloadId) {
			return getPayloadUrl("/payloads/" + encodeURIComponent(sPayloadId) + "/download");
		}
	};
});
