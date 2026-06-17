//Script runs when index.html is bootstrapped. Externalizes javascript from HTML file.

sap.ui.define(
    
    //List of dependencies
    [
    "sap/ui/core/ComponentContainer",
    ], 
    
    function (ComponentContainer) {
    "use strict";

    new ComponentContainer({
        name: "ui5.walkthrough",
        settings: {
            id: "walkthrough"
        },
        async: true
    }).placeAt("content");
    
})