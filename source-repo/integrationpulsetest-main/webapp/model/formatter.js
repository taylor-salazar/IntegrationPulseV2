sap.ui.define([


],

function () {
    "use strict";
    return {
        statusText: function (sStatus) {
            var resrouceBundle = this.getView().getModel("i18n").getResourceBundle();
            switch (sStatus) {
                case "A":
                    return resrouceBundle.getText("Deployed");
                case "I":
                    return resrouceBundle.getText("Inactive");
                default: 
                    return sStatus;
            }

            

        },

        formatDeployedOn: function(sValue){
            if (!sValue) return "";

            const oDate = new Date(sValue)

            if (isNaN(oDate.getTime())) return sValue;

            return oDate.toLocaleString();
        },

        statusState: function(sStatus){
            switch (sStatus){
                case "STARTED":
                    return "Success";
                case "STOPPED":
                    return "Error";
                default:
                    return "Warning";
            }
        }
    }
}
);