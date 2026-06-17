sap.ui.define([
	"sap/base/Log",
	"integrationpulse/service/config"
], function (Log, config) {
	"use strict";

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

	function delay(ms) {
		return new Promise(function (resolve) {
			setTimeout(resolve, ms);
		});
	}

	function getJSON(sUrl) {
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
		return {
			messageId: oRaw.MessageGuid || oRaw.MessageId || oRaw.messageId || "",
			status: oRaw.Status || oRaw.status || "",
			sender: oRaw.Sender || oRaw.sender || "",
			logEnd: oRaw.LogEnd || oRaw.logEnd || null,
			durationMs: oRaw.Duration || oRaw.durationMs || 0,
			errorMessage: oRaw.CustomStatus || oRaw.ErrorMessage || oRaw.errorMessage || ""
		};
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
			return Object.assign({}, oRuntimeItem, {
				designTimeId: oDesignTimeItem.id || oRuntimeItem.designTimeId,
				designTimeVersion: oDesignTimeItem.designTimeVersion || oRuntimeItem.designTimeVersion,
				sender: oDesignTimeItem.sender || "",
				receiver: oDesignTimeItem.receiver || "",
				packageName: oRuntimeItem.packageName || oDesignTimeItem.packageName,
				name: oRuntimeItem.name || oDesignTimeItem.name || oRuntimeItem.id
			});
		});
	}

	function getDestinationIntegrations() {
		return getJSON(getDestinationUrl("/IntegrationRuntimeArtifacts")).then(function (d) {
			var aRuntimeItems = runtimeArtifactsOnly(odataResults(d).map(mapIntegration));
			return Promise.all(aRuntimeItems.map(withDesignTimeMetadata));
		});
	}

	function getDestinationIntegration(sId) {
		return getDestinationIntegrations().then(function (aItems) {
			return aItems.filter(function (o) { return o.id === sId; })[0] || null;
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
		return getDestinationIntegration(sId).then(function (oIntegration) {
			var sVersion = (oIntegration && oIntegration.version) || "active";
			return tryGetConfigurations(getDesignTimeIdCandidates(sId, oIntegration), sVersion, 0);
		});
	}

	function updateDestinationConfigurations(sId, aConfigurations) {
		if (!aConfigurations || !aConfigurations.length) {
			return Promise.resolve({ id: sId, updated: 0 });
		}
		return getDestinationIntegration(sId).then(function (oIntegration) {
			var sDesignTimeId = (oIntegration && oIntegration.designTimeId) || sId;
			var sVersion = (oIntegration && oIntegration.version) || "active";
			var aUpdates = aConfigurations.map(function (oConfig) {
				var sPath = "/IntegrationDesigntimeArtifacts(Id=" + odataLiteral(sDesignTimeId) +
					",Version=" + odataLiteral(sVersion) + ")/$links/Configurations(" +
					odataLiteral(oConfig.key) + ")";
				return sendJSON(getDestinationUrl(sPath), "PUT", {
					ParameterValue: oConfig.value
				});
			});
			return Promise.all(aUpdates).then(function () {
				return { id: sId, updated: aConfigurations.length };
			});
		});
	}

	function deployDestinationIntegration(sId, aConfigurations) {
		return updateDestinationConfigurations(sId, aConfigurations).then(function () {
			return getDestinationIntegration(sId);
		}).then(function (oIntegration) {
			var sDesignTimeId = (oIntegration && oIntegration.designTimeId) || sId;
			var sVersion = (oIntegration && oIntegration.version) || "active";
			var sPath = "/DeployIntegrationDesigntimeArtifact?Id=" + odataLiteral(sDesignTimeId) +
				"&Version=" + odataLiteral(sVersion);
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
						return {
							id: o.id,
							name: o.name,
							packageName: o.packageName,
							endpoint: "",
							status: o.status,
							messages24h: 0,
							errors24h: 0,
							lastDeployed: o.lastDeployed
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
						return d[sId] || [];
					});
				});
			}
			if (LIVE_MODE === "destination") {
				var sFilter = encodeURIComponent("IntegrationFlowName eq '" + odataString(sId) + "'");
				var sPath = "/MessageProcessingLogs?$filter=" + sFilter +
					"&$orderby=LogEnd%20desc&$top=50&$format=json";
				return getJSON(getDestinationUrl(sPath)).then(function (d) {
					return odataResults(d).map(mapMessageLog);
				});
			}
			return getJSON(config.backendBaseUrl + "/api/monitoring/" + encodeURIComponent(sId) + "/logs");
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
