sap.ui.define(
    [
    "sap/ui/core/mvc/Controller", 
    "sap/m/MessageToast",
    "sap/ui/core/Fragment"
    ],

    function (Controller, MessageToast, Fragment) {
        "use strict";  
        return Controller.extend("ui5.walkthrough.controller.IntegrationPanel", {
            onShowHello : function (){
                //read msg from i18n model
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                var sRecipient = this.getView().getModel().getProperty("/integrationName/name");
                var sMsg = oBundle.getText("SuccessfulDeployMessage", [sRecipient]);
                
                MessageToast.show(sMsg);
            },
            
            onDeployIntegrationBtnPress: function() {
                this.getOwnerComponent().openDeployDialog();
            }

        }
        );
    }

)