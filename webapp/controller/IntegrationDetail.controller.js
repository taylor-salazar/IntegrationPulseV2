sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"integrationpulse/service/BackendClient",
	"sap/ui/core/Fragment",
	"sap/ui/core/Item",
	"sap/m/Button",
	"sap/m/Dialog",
	"sap/m/Label",
	"sap/m/Link",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/m/MultiComboBox",
	"sap/m/Text",
	"sap/m/TextArea",
	"sap/m/VBox"
], function (
	BaseController,
	JSONModel,
	BackendClient,
	Fragment,
	Item,
	Button,
	Dialog,
	Label,
	Link,
	MessageToast,
	MessageBox,
	MultiComboBox,
	Text,
	TextArea,
	VBox
) {
	"use strict";

	// Integration Detail controller: lets a user inspect one deployed
	// integration, edit supported externalized parameters, save configuration
	// changes, redeploy the integration, or trigger its separate HTTPS sender
	// endpoint for an immediate run without touching timer parameters.

	// Human labels for the enterprise parameter group prefixes.
	var GROUP_LABELS = {
		pulse: "Pulse",
		extract: "Extract",
		filter: "Filter",
		include: "Include",
		delivery: "Delivery",
		audit: "Audit",
		sftp: "SFTP",
		general: "General"
	};

	function pad2(v) {
		return String(Number(v) || 0).padStart(2, "0");
	}

	function cronStartValue(sField, sFallback) {
		if (!sField || sField === "*" || sField === "?") {
			return sFallback;
		}
		return String(sField).split("/")[0].split(",")[0];
	}

	function ordinal(i) {
		var j = i % 10;
		var k = i % 100;
		if (j === 1 && k !== 11) { return i + "st"; }
		if (j === 2 && k !== 12) { return i + "nd"; }
		if (j === 3 && k !== 13) { return i + "rd"; }
		return i + "th";
	}

	function range(iStart, iEnd, fnLabel) {
		var aItems = [];
		for (var i = iStart; i <= iEnd; i += 1) {
			aItems.push({ key: String(i), text: fnLabel ? fnLabel(i) : String(i) });
		}
		return aItems;
	}

	var MONTHS = [
		{ key: "JAN", text: "January" },
		{ key: "FEB", text: "February" },
		{ key: "MAR", text: "March" },
		{ key: "APR", text: "April" },
		{ key: "MAY", text: "May" },
		{ key: "JUN", text: "June" },
		{ key: "JUL", text: "July" },
		{ key: "AUG", text: "August" },
		{ key: "SEP", text: "September" },
		{ key: "OCT", text: "October" },
		{ key: "NOV", text: "November" },
		{ key: "DEC", text: "December" }
	];

	var WEEKDAYS = [
		{ key: "MON", text: "Monday" },
		{ key: "TUE", text: "Tuesday" },
		{ key: "WED", text: "Wednesday" },
		{ key: "THU", text: "Thursday" },
		{ key: "FRI", text: "Friday" },
		{ key: "SAT", text: "Saturday" },
		{ key: "SUN", text: "Sunday" }
	];

	var SF_SELECT_FIELDS = [
		{ key: "userId", text: "Employee ID" },
		{ key: "personIdExternal", text: "Person ID" },
		{ key: "firstName", text: "First name" },
		{ key: "lastName", text: "Last name" },
		{ key: "displayName", text: "Display name" },
		{ key: "email", text: "Email" },
		{ key: "company", text: "Company" },
		{ key: "businessUnit", text: "Business unit" },
		{ key: "division", text: "Division" },
		{ key: "department", text: "Department" },
		{ key: "location", text: "Location" },
		{ key: "jobCode", text: "Job code" },
		{ key: "jobTitle", text: "Job title" },
		{ key: "managerId", text: "Manager ID" },
		{ key: "emplStatus", text: "Employment status" },
		{ key: "employeeClass", text: "Employee class" },
		{ key: "employmentType", text: "Employment type" },
		{ key: "payGrade", text: "Pay grade" },
		{ key: "event", text: "Event" },
		{ key: "eventReason", text: "Event reason" },
		{ key: "startDate", text: "Start date" },
		{ key: "endDate", text: "End date" },
		{ key: "lastModifiedDateTime", text: "Last modified date/time" }
	];

	var SF_EXPAND_FIELDS = [
		{ key: "employmentNav", text: "Employment details" },
		{ key: "personNav", text: "Person details" },
		{ key: "userNav", text: "User account" },
		{ key: "jobInfoNav", text: "Job information" },
		{ key: "compInfoNav", text: "Compensation information" },
		{ key: "payComponentRecurringNav", text: "Recurring pay components" },
		{ key: "emailNav", text: "Email addresses" },
		{ key: "phoneNav", text: "Phone numbers" },
		{ key: "nationalIdNav", text: "National IDs" },
		{ key: "addressNavDEFLT", text: "Home address" }
	];

	return BaseController.extend("integrationpulse.controller.IntegrationDetail", {

		onInit: function () {
			// integration: selected artifact details
			// parameters: grouped editable externalized parameters
			// payloads/payloadDetail: captured result payload previews
			// scheduleOptions: static select options for timer-like parameters
			// detailView: UI-only state such as busy/dirty
			this.setModel(new JSONModel({}), "integration");
			this.setModel(new JSONModel({ groups: [] }), "parameters");
			this.setModel(new JSONModel({ items: [] }), "payloads");
			this.setModel(new JSONModel({}), "payloadDetail");
			this.setModel(new JSONModel(this._createScheduleOptions()), "scheduleOptions");
			this.setModel(new JSONModel({ busy: false, dirty: false }), "detailView");

			this.getRouter().getRoute("integrationDetail").attachPatternMatched(this._onMatched, this);
		},

		_onMatched: function (oEvent) {
			this._sId = oEvent.getParameter("arguments").id;
			this._load();
		},

		_load: function () {
			var that = this;
			this.getModel("detailView").setProperty("/dirty", false);
			this.getView().setModel(this.getModel("detailView"));
			this.getModel("detailView").setProperty("/busy", true);

			Promise.all([
				BackendClient.getIntegration(this._sId),
				BackendClient.getConfigurations(this._sId)
			]).then(function (aRes) {
				var oIntegration = aRes[0] || {};
				var aConfigs = aRes[1] || [];
				that.getModel("integration").setData(oIntegration);
				that.getModel("parameters").setData({ groups: that._groupParams(aConfigs) });
				that.getModel("detailView").setProperty("/busy", false);
			}).catch(function (oErr) {
				that.getModel("detailView").setProperty("/busy", false);
				MessageToast.show("Failed to load configuration: " + oErr.message);
			});
		},

		_loadPayloads: function () {
			BackendClient.getPayloads(this._sId).then(function (aPayloads) {
				this.getModel("payloads").setProperty("/items", aPayloads || []);
			}.bind(this)).catch(function () {
				this.getModel("payloads").setProperty("/items", []);
			}.bind(this));
		},

		/**
		 * Groups a flat parameter list by its prefix (extract.* / sftp.* ...).
		 * Keeps a pristine copy on each param for reset / dirty detection.
		 */
		_groupParams: function (aConfigs) {
			var mGroups = {};
			aConfigs.forEach(function (oParam) {
				var sPrefix = (oParam.key.indexOf(".") > -1) ? oParam.key.split(".")[0] : "general";
				var sGroupName = GROUP_LABELS[sPrefix] || (sPrefix.charAt(0).toUpperCase() + sPrefix.slice(1));
				if (!mGroups[sPrefix]) {
					mGroups[sPrefix] = { name: sGroupName, prefix: sPrefix, params: [] };
				}
				mGroups[sPrefix].params.push({
					key: oParam.key,
					label: oParam.label || oParam.key,
					value: oParam.value !== undefined ? oParam.value : "",
					pristineValue: oParam.value !== undefined ? oParam.value : "",
					defaultValue: oParam.defaultValue || "",
					dataType: oParam.dataType || "xsd:string",
					secure: !!oParam.secure,
					readOnly: !!oParam.readOnly,
					isTimer: this._isTimerParam(oParam),
					schedule: this._scheduleFromCron(oParam.value || oParam.defaultValue || "")
				});
			}.bind(this));
			// Stable, business-friendly order.
			var aOrder = ["pulse", "extract", "filter", "include", "delivery", "audit", "sftp", "general"];
			return Object.keys(mGroups).sort(function (a, b) {
				var ia = aOrder.indexOf(a); var ib = aOrder.indexOf(b);
				return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
			}).map(function (k) { return mGroups[k]; });
		},

		_collectParams: function () {
			var aOut = [];
			(this.getModel("parameters").getProperty("/groups") || []).forEach(function (oGroup) {
				oGroup.params.forEach(function (oParam) {
					aOut.push({
						key: oParam.key,
						value: oParam.value,
						dataType: oParam.dataType || "xsd:string"
					});
				});
			});
			return aOut;
		},

		_findParamValue: function (sKey) {
			var oParam = this._findParam(sKey);
			return oParam ? (oParam.value || oParam.defaultValue || "") : "";
		},

		_findParam: function (sKey) {
			var sFound = "";
			var oFound = null;
			(this.getModel("parameters").getProperty("/groups") || []).some(function (oGroup) {
				return oGroup.params.some(function (oParam) {
					if (oParam.key === sKey) {
						sFound = oParam;
						oFound = oParam;
						return true;
					}
					return false;
				});
			});
			return oFound || sFound;
		},

		_splitQueryList: function (sValue) {
			return String(sValue || "")
				.replace(/^\s*\$?(select|expand)\s*=\s*/i, "")
				.split(",")
				.map(function (sItem) { return sItem.trim(); })
				.filter(Boolean);
		},

		_joinQueryList: function (aValues) {
			return (aValues || []).map(function (sValue) {
				return String(sValue || "").trim();
			}).filter(Boolean).join(",");
		},

		_getPulseRunOptionsFromDialog: function () {
			return {
				selectQuery: this._oPulseSelectTextArea ? this._oPulseSelectTextArea.getValue().trim() : "",
				expandQuery: this._oPulseExpandTextArea ? this._oPulseExpandTextArea.getValue().trim() : ""
			};
		},

		_formatPulseGeneratedQuery: function () {
			var oOptions = this._getPulseRunOptionsFromDialog();
			var aParts = [];
			if (oOptions.selectQuery) {
				aParts.push("$select=" + oOptions.selectQuery);
			}
			if (oOptions.expandQuery) {
				aParts.push("$expand=" + oOptions.expandQuery);
			}
			return aParts.join("&") || this.getText("pulseDebugNoQuery");
		},

		_refreshPulseDebugQuery: function () {
			if (this._oPulseDebugTextArea) {
				this._oPulseDebugTextArea.setValue(this._formatPulseGeneratedQuery());
			}
		},

		_syncPulseTextAreasFromPickers: function () {
			if (this._oPulseSelectTextArea && this._oPulseSelectPicker) {
				this._oPulseSelectTextArea.setValue(this._joinQueryList(this._oPulseSelectPicker.getSelectedKeys()));
			}
			if (this._oPulseExpandTextArea && this._oPulseExpandPicker) {
				this._oPulseExpandTextArea.setValue(this._joinQueryList(this._oPulseExpandPicker.getSelectedKeys()));
			}
			this._refreshPulseDebugQuery();
		},

		_createPulseFieldPicker: function (aFields, aSelected, sPlaceholder) {
			var oPicker = new MultiComboBox({
				width: "100%",
				placeholder: sPlaceholder,
				selectedKeys: aSelected,
				selectionFinish: this._syncPulseTextAreasFromPickers.bind(this)
			});
			aFields.forEach(function (oField) {
				oPicker.addItem(new Item({ key: oField.key, text: oField.text + " (" + oField.key + ")" }));
			});
			return oPicker;
		},

		_togglePulseAdvancedBox: function (sType, oLink) {
			var oBox = sType === "select" ? this._oPulseSelectAdvancedBox : this._oPulseExpandAdvancedBox;
			if (!oBox) {
				return;
			}
			var bShow = !oBox.getVisible();
			oBox.setVisible(bShow);
			oLink.setText(bShow ?
				this.getText("pulseHideAdvancedQuery") :
				this.getText("pulseShowAdvancedQuery"));
		},

		_togglePulseDebugBox: function (oLink) {
			if (!this._oPulseDebugBox) {
				return;
			}
			var bShow = !this._oPulseDebugBox.getVisible();
			this._oPulseDebugBox.setVisible(bShow);
			oLink.setText(bShow ?
				this.getText("pulseHideGeneratedQuery") :
				this.getText("pulseShowGeneratedQuery"));
			if (bShow) {
				this._refreshPulseDebugQuery();
			}
		},

		_openPulseRunDialog: function (oIntegration, sName) {
			var aSelectDefaults = this._splitQueryList(this._findParamValue("pulse.selectQuery"));
			var aExpandDefaults = this._splitQueryList(this._findParamValue("pulse.expandQuery"));
			this._oPulseSelectPicker = this._createPulseFieldPicker(
				SF_SELECT_FIELDS,
				aSelectDefaults,
				this.getText("pulseSelectPlaceholder")
			);
			this._oPulseExpandPicker = this._createPulseFieldPicker(
				SF_EXPAND_FIELDS,
				aExpandDefaults,
				this.getText("pulseExpandPlaceholder")
			);
			this._oPulseSelectTextArea = new TextArea({
				width: "100%",
				rows: 3,
				value: this._joinQueryList(aSelectDefaults),
				placeholder: "userId,personIdExternal,firstName,lastName",
				liveChange: this._refreshPulseDebugQuery.bind(this)
			});
			this._oPulseExpandTextArea = new TextArea({
				width: "100%",
				rows: 3,
				value: this._joinQueryList(aExpandDefaults),
				placeholder: "employmentNav,personNav,emailNav",
				liveChange: this._refreshPulseDebugQuery.bind(this)
			});
			this._oPulseDebugTextArea = new TextArea({
				width: "100%",
				rows: 3,
				editable: false,
				value: this._formatPulseGeneratedQuery()
			}).addStyleClass("ipPulseDebugTextArea");
			this._oPulseSelectAdvancedBox = new VBox({
				visible: false,
				items: [
					new Label({ text: this.getText("pulseSelectAdvanced") }),
					this._oPulseSelectTextArea
				]
			}).addStyleClass("ipPulseAdvancedBox");
			this._oPulseExpandAdvancedBox = new VBox({
				visible: false,
				items: [
					new Label({ text: this.getText("pulseExpandAdvanced") }),
					this._oPulseExpandTextArea
				]
			}).addStyleClass("ipPulseAdvancedBox");
			this._oPulseDebugBox = new VBox({
				visible: false,
				items: [
					new Label({ text: this.getText("pulseGeneratedQuery") }),
					this._oPulseDebugTextArea
				]
			}).addStyleClass("ipPulseDebugBox");

			var oSelectGroup = new VBox({
				items: [
					new Label({ text: this.getText("pulseSelectFields") }).addStyleClass("ipPulseFieldLabel"),
					this._oPulseSelectPicker,
					new Link({
						text: this.getText("pulseShowAdvancedQuery"),
						press: function (oEvent) {
							this._togglePulseAdvancedBox("select", oEvent.getSource());
						}.bind(this)
					}).addStyleClass("ipPulseAdvancedLink"),
					this._oPulseSelectAdvancedBox
				]
			}).addStyleClass("ipPulseFieldGroup");

			var oExpandGroup = new VBox({
				items: [
					new Label({ text: this.getText("pulseExpandFields") }).addStyleClass("ipPulseFieldLabel"),
					this._oPulseExpandPicker,
					new Link({
						text: this.getText("pulseShowAdvancedQuery"),
						press: function (oEvent) {
							this._togglePulseAdvancedBox("expand", oEvent.getSource());
						}.bind(this)
					}).addStyleClass("ipPulseAdvancedLink"),
					this._oPulseExpandAdvancedBox
				]
			}).addStyleClass("ipPulseFieldGroup");

			var oDialog = new Dialog({
				title: this.getText("pulseRunDialogTitle"),
				contentWidth: "46rem",
				content: [
					new VBox({
						items: [
							new Text({ text: this.getText("pulseRunDialogIntro") }).addStyleClass("ipPulseIntro"),
							oSelectGroup,
							oExpandGroup,
							new Link({
								text: this.getText("pulseShowGeneratedQuery"),
								press: function (oEvent) {
									this._togglePulseDebugBox(oEvent.getSource());
								}.bind(this)
							}).addStyleClass("ipPulseDebugLink"),
							this._oPulseDebugBox
						]
					}).addStyleClass("ipPulseRunContent")
				],
				beginButton: new Button({
					text: this.getText("deployImmediately"),
					type: "Emphasized",
					press: function () {
						var oRunOptions = this._getPulseRunOptionsFromDialog();
						oDialog.close();
						this._doDeployImmediately(oIntegration, sName, oRunOptions);
					}.bind(this)
				}),
				endButton: new Button({
					text: this.getText("cancel"),
					press: function () { oDialog.close(); }
				}),
				afterClose: function () {
					oDialog.destroy();
					this._oPulseSelectPicker = null;
					this._oPulseExpandPicker = null;
					this._oPulseSelectTextArea = null;
					this._oPulseExpandTextArea = null;
					this._oPulseSelectAdvancedBox = null;
					this._oPulseExpandAdvancedBox = null;
					this._oPulseDebugTextArea = null;
					this._oPulseDebugBox = null;
				}.bind(this)
			});
			this.getView().addDependent(oDialog);
			oDialog.open();
		},

		_recomputeDirty: function () {
			var bDirty = false;
			(this.getModel("parameters").getProperty("/groups") || []).forEach(function (oGroup) {
				oGroup.params.forEach(function (oParam) {
					if (oParam.value !== oParam.pristineValue) {
						bDirty = true;
					}
				});
			});
			this.getModel("detailView").setProperty("/dirty", bDirty);
		},

		_scheduleModeFromIndex: function (iIndex) {
			return ["once", "day", "recur", "advanced"][Number(iIndex) || 0] || "advanced";
		},

		_scheduleModeToIndex: function (sMode) {
			var iIndex = ["once", "day", "recur", "advanced"].indexOf(sMode);
			return iIndex > -1 ? iIndex : 3;
		},

		onParamChange: function () {
			this._recomputeDirty();
		},

		_createScheduleOptions: function () {
			return {
				frequencyModes: [
					{ key: "once", text: "Run Once" },
					{ key: "day", text: "Schedule on Day" },
					{ key: "recur", text: "Schedule to Recur" },
					{ key: "advanced", text: "Advanced" }
				],
				secondModes: [
					{ key: "specific", text: "Specific seconds" },
					{ key: "every", text: "Every second" },
					{ key: "start", text: "Every 1 second starting at" }
				],
				minuteModes: [
					{ key: "specific", text: "Specific minutes" },
					{ key: "every", text: "Every minute" },
					{ key: "start", text: "Every 1 minute starting at" }
				],
				hourModes: [
					{ key: "specific", text: "Specific hours" },
					{ key: "every", text: "Every hour" },
					{ key: "start", text: "Every 1 hour starting at" }
				],
				dayModes: [
					{ key: "every", text: "Every day" },
					{ key: "specific", text: "Specific days" }
				],
				monthModes: [
					{ key: "every", text: "Every month" },
					{ key: "specific", text: "Specific months" }
				],
				yearModes: [
					{ key: "every", text: "Every year" },
					{ key: "specific", text: "Specific years" }
				],
				seconds: range(0, 59, function (i) { return ordinal(i); }),
				minutes: range(0, 59, function (i) { return ordinal(i) + " minute"; }),
				hours: range(0, 23, function (i) { return ordinal(i) + " hour"; }),
				days: range(1, 31, ordinal),
				months: MONTHS,
				years: range(new Date().getFullYear(), new Date().getFullYear() + 10),
				weekdays: WEEKDAYS,
				recurUnits: [
					{ key: "minutes", text: "Minutes" },
					{ key: "hours", text: "Hours" },
					{ key: "days", text: "Days" }
				],
				timeZones: [
					{ key: "America/Los_Angeles", text: "America/Los Angeles (PT)" },
					{ key: "America/New_York", text: "America/New York (ET)" },
					{ key: "UTC", text: "UTC" },
					{ key: "Europe/London", text: "Europe/London" }
				]
			};
		},

		_isTimerParam: function (oParam) {
			var sText = [oParam.key, oParam.label].join(" ").toLowerCase();
			return /\b(timer|cron|schedule|frequency)\b/.test(sText);
		},

		_scheduleFromCron: function (sValue) {
			var sCron = String(sValue || "").trim();
			var sTimeZone = "America/Los_Angeles";
			var aTz = sCron.match(/--tz=([^\s]+)/);
			if (aTz) {
				sTimeZone = aTz[1];
				sCron = sCron.replace(/\s*--tz=[^\s]+/, "");
			}
			var aParts = sCron.split(/\s+/);
			var sSeconds = aParts[0] || "0";
			var sMinutes = aParts[1] || "0";
			var sHours = aParts[2] || "0";
			var sDays = aParts[3] || "*";
			var sMonths = aParts[4] || "*";
			var sWeekdays = aParts[5] || "?";
			var sYears = aParts[6] || "*";
			var sToday = new Date().toISOString().slice(0, 10);
			var sDisplayHour = cronStartValue(sHours, "0");
			var sDisplayMinute = cronStartValue(sMinutes, "0");
			return {
				mode: "advanced",
				modeIndex: 3,
				onceDate: sToday,
				onceTime: pad2(sDisplayHour) + ":" + pad2(sDisplayMinute),
				dayWeekdays: sWeekdays && sWeekdays !== "?" && sWeekdays !== "*" ? sWeekdays.split(",") : ["MON"],
				dayTime: pad2(sHours === "*" ? 9 : sDisplayHour) + ":" + pad2(sDisplayMinute),
				recurEvery: "1",
				recurUnit: "hours",
				recurStartTime: "09:00",
				secondMode: sSeconds === "*" ? "every" : (sSeconds.indexOf("/") > -1 ? "start" : "specific"),
				minuteMode: sMinutes === "*" ? "every" : (sMinutes.indexOf("/") > -1 ? "start" : "specific"),
				hourMode: sHours === "*" ? "every" : (sHours.indexOf("/") > -1 ? "start" : "specific"),
				dayMode: sDays === "*" || sDays === "?" ? "every" : "specific",
				monthMode: sMonths === "*" ? "every" : "specific",
				yearMode: sYears === "*" ? "every" : "specific",
				seconds: this._cronFieldToKeys(sSeconds, "0"),
				minutes: this._cronFieldToKeys(sMinutes, "0"),
				hours: this._cronFieldToKeys(sHours, "0"),
				days: this._cronFieldToKeys(sDays, "1"),
				months: this._cronFieldToKeys(sMonths, "JAN"),
				years: this._cronFieldToKeys(sYears, String(new Date().getFullYear())),
				timeZone: sTimeZone
			};
		},

		_cronFieldToKeys: function (sField, sFallback) {
			if (!sField || sField === "*" || sField === "?") {
				return [sFallback];
			}
			if (sField.indexOf("/") > -1) {
				return [sField.split("/")[0]];
			}
			return sField.split(",");
		},

		_keysToCronField: function (sMode, aValues, sEvery, sPrefix) {
			var aKeys = aValues && aValues.length ? aValues : [sEvery];
			if (sMode === "every") {
				return "*";
			}
			if (sMode === "start") {
				return aKeys[0] + "/1";
			}
			if (sPrefix) {
				return aKeys.map(function (sKey) { return sPrefix + sKey; }).join(",");
			}
			return aKeys.join(",");
		},

		_scheduleToCron: function (oSchedule) {
			var sTz = oSchedule.timeZone ? " --tz=" + oSchedule.timeZone : "";
			if (oSchedule.mode === "once") {
				var aDate = (oSchedule.onceDate || "").split("-");
				var aTime = (oSchedule.onceTime || "00:00").split(":");
				var sMonth = MONTHS[Number(aDate[1] || 1) - 1].key;
				return "0 " + Number(aTime[1] || 0) + " " + Number(aTime[0] || 0) + " " +
					Number(aDate[2] || 1) + " " + sMonth + " ? " + (aDate[0] || "*") + sTz;
			}
			if (oSchedule.mode === "day") {
				var aDayTime = (oSchedule.dayTime || "09:00").split(":");
				return "0 " + Number(aDayTime[1] || 0) + " " + Number(aDayTime[0] || 0) +
					" ? * " + (oSchedule.dayWeekdays || ["MON"]).join(",") + " *" + sTz;
			}
			if (oSchedule.mode === "recur") {
				var nEvery = Math.max(Number(oSchedule.recurEvery || 1), 1);
				if (oSchedule.recurUnit === "minutes") {
					return "0 0/" + nEvery + " * ? * * *" + sTz;
				}
				if (oSchedule.recurUnit === "hours") {
					return "0 0 0/" + nEvery + " ? * * *" + sTz;
				}
				var aStartTime = (oSchedule.recurStartTime || "09:00").split(":");
				return "0 " + Number(aStartTime[1] || 0) + " " + Number(aStartTime[0] || 0) +
					" 1/" + nEvery + " * ? *" + sTz;
			}
			return [
				this._keysToCronField(oSchedule.secondMode, oSchedule.seconds, "0"),
				this._keysToCronField(oSchedule.minuteMode, oSchedule.minutes, "0"),
				this._keysToCronField(oSchedule.hourMode, oSchedule.hours, "0"),
				this._keysToCronField(oSchedule.dayMode, oSchedule.days, "*"),
				this._keysToCronField(oSchedule.monthMode, oSchedule.months, "*"),
				"?",
				this._keysToCronField(oSchedule.yearMode, oSchedule.years, "*")
			].join(" ") + sTz;
		},

		onTimerScheduleChange: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("parameters");
			var oParam = oCtx && oCtx.getObject();
			if (!oParam || !oParam.schedule) {
				return;
			}
			oParam.schedule.modeIndex = this._scheduleModeToIndex(oParam.schedule.mode);
			oParam.value = this._scheduleToCron(oParam.schedule);
			this.getModel("parameters").refresh(true);
			this._recomputeDirty();
		},

		onTimerModeSelect: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("parameters");
			var oParam = oCtx && oCtx.getObject();
			if (!oParam || !oParam.schedule) {
				return;
			}
			oParam.schedule.modeIndex = oEvent.getParameter("selectedIndex");
			oParam.schedule.mode = this._scheduleModeFromIndex(oParam.schedule.modeIndex);
			oParam.value = this._scheduleToCron(oParam.schedule);
			this.getModel("parameters").refresh(true);
			this._recomputeDirty();
		},

		onReset: function () {
			var oModel = this.getModel("parameters");
			var aGroups = oModel.getProperty("/groups") || [];
			aGroups.forEach(function (oGroup) {
				oGroup.params.forEach(function (oParam) {
					oParam.value = oParam.pristineValue;
					if (oParam.isTimer) {
						oParam.schedule = this._scheduleFromCron(oParam.pristineValue);
					}
				}.bind(this));
			}.bind(this));
			oModel.setProperty("/groups", aGroups);
			this.getModel("detailView").setProperty("/dirty", false);
		},

		onSaveDraft: function () {
			var that = this;
			this.getModel("detailView").setProperty("/busy", true);
			BackendClient.updateConfigurations(this._sId, this._collectParams()).then(function () {
				// Saved values become the new pristine baseline.
				var oModel = that.getModel("parameters");
				var aGroups = oModel.getProperty("/groups") || [];
				aGroups.forEach(function (oGroup) {
					oGroup.params.forEach(function (oParam) { oParam.pristineValue = oParam.value; });
				});
				oModel.setProperty("/groups", aGroups);
				that.getModel("detailView").setProperty("/dirty", false);
				that.getModel("detailView").setProperty("/busy", false);
				MessageToast.show(that.getText("save") + " ✓");
			}).catch(function (oErr) {
				that.getModel("detailView").setProperty("/busy", false);
				MessageToast.show("Save failed: " + oErr.message);
			});
		},

		onDeploy: function () {
			var that = this;
			var sName = this.getModel("integration").getProperty("/name");
			MessageBox.confirm(this.getText("deployConfirmText", [sName]), {
				title: this.getText("deployConfirmTitle"),
				icon: MessageBox.Icon.WARNING,
				actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
				emphasizedAction: MessageBox.Action.OK,
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) {
						that._doDeploy(sName);
					}
				}
			});
		},

		onDeployImmediately: function () {
			var oIntegration = this.getModel("integration").getData() || {};
			var sName = oIntegration.name || oIntegration.id || this._sId;
			this._openPulseRunDialog(oIntegration, sName);
		},

		_doDeployImmediately: function (oIntegration, sName, oRunOptions) {
			var that = this;
			this.getModel("detailView").setProperty("/busy", true);
			MessageToast.show(this.getText("deployImmediatelyStarted", [sName]));
			BackendClient.triggerImmediateRun(oIntegration, oRunOptions).then(function () {
				that.getModel("detailView").setProperty("/busy", false);
				MessageBox.success(that.getText("deployImmediatelySuccess", [sName]));
			}).catch(function (oErr) {
				that.getModel("detailView").setProperty("/busy", false);
				MessageBox.error(that.getText("deployImmediatelyError", [oErr.message]));
			});
		},

		_doDeploy: function (sName) {
			var that = this;
			this.getModel("detailView").setProperty("/busy", true);
			MessageToast.show(this.getText("deployStarted", [sName]));
			BackendClient.deployIntegration(this._sId, this._collectParams()).then(function (oRes) {
				that.getModel("detailView").setProperty("/busy", false);
				that.getModel("detailView").setProperty("/dirty", false);
				// Saved values become pristine after a successful deploy.
				var oModel = that.getModel("parameters");
				var aGroups = oModel.getProperty("/groups") || [];
				aGroups.forEach(function (oGroup) {
					oGroup.params.forEach(function (oParam) { oParam.pristineValue = oParam.value; });
				});
				oModel.setProperty("/groups", aGroups);
				if (oRes && oRes.status) {
					that.getModel("integration").setProperty("/status", oRes.status);
				}
				MessageBox.success(that.getText("deploySuccess", [sName]));
			}).catch(function (oErr) {
				that.getModel("detailView").setProperty("/busy", false);
				MessageBox.error(that.getText("deployError", [oErr.message]));
			});
		},

		onOpenPayload: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("payloads");
			var oPayload = oCtx && oCtx.getObject();
			if (!oPayload) {
				return;
			}
			if (oPayload.downloadOnly || !oPayload.previewAvailable) {
				window.open(BackendClient.getPayloadDownloadUrl(oPayload.id), "_blank", "noopener");
				return;
			}
			BackendClient.getPayload(oPayload.id).then(function (oDetail) {
				if (!oDetail) {
					MessageToast.show(this.getText("payloadNotFound"));
					return;
				}
				oDetail.formattedPayload = this._formatPayload(oDetail.payload, oDetail.contentType);
				this.getModel("payloadDetail").setData(oDetail);
				this._openPayloadDialog();
			}.bind(this)).catch(function (oErr) {
				MessageToast.show(this.getText("payloadLoadFailed", [oErr.message]));
			}.bind(this));
		},

		onDownloadPayload: function () {
			var sId = this.getModel("payloadDetail").getProperty("/id");
			if (sId) {
				window.open(BackendClient.getPayloadDownloadUrl(sId), "_blank", "noopener");
			}
		},

		onClosePayloadDialog: function () {
			if (this._oPayloadDialog) {
				this._oPayloadDialog.close();
			}
		},

		_openPayloadDialog: function () {
			if (this._oPayloadDialog) {
				this._oPayloadDialog.open();
				return;
			}
			Fragment.load({
				id: this.getView().getId(),
				name: "integrationpulse.view.PayloadDialog",
				controller: this
			}).then(function (oDialog) {
				this._oPayloadDialog = oDialog;
				this.getView().addDependent(oDialog);
				oDialog.open();
			}.bind(this));
		},

		_formatPayload: function (sPayload, sContentType) {
			if (!sPayload) {
				return "";
			}
			if ((sContentType || "").indexOf("json") > -1) {
				try {
					return JSON.stringify(JSON.parse(sPayload), null, 2);
				} catch (e) {
					return sPayload;
				}
			}
			return sPayload;
		},

		onNavBack: function () {
			this.navTo("integrations");
		},

		onExit: function () {
			if (this._oPayloadDialog) {
				this._oPayloadDialog.destroy();
				this._oPayloadDialog = null;
			}
		}
	});
});
