sap.ui.define(

    [
    "sap/ui/core/mvc/Controller", 
    ], 
    
    function (Controller, MessageToast, JSONModel, ResourceModel) {
        "use strict";  //Tells browser to execute code in strict mode, which can help catch errors and improve performance. 

    return Controller.extend("ui5.walkthrough.controller.App",{
        
        //Event linked to App.view.xml that opens the deploy dialog when the button is pressed. Calls the openDeployDialog function in the component controller.
        onDeployIntegrationBtnPress : function() {
            this.getOwnerComponent().openDeployDialog();
        }

    })
});