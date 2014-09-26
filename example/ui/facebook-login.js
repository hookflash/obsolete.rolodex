
define([
	"rolodex/client"
], function(ROLODEX) {

	var rolodex = new ROLODEX({
		loadContacts: false
	});

	var initRequest = false;
	if (window.location.search) {
		var m = window.location.search.match(/callback=([^&]+)(&|$)/);
		if (m) {
			initRequest = true;
			window.localStorage.callback = m[1];
		}
	}

	rolodex.on("services.fetched", function(services) {
		if (!services["facebook"]) return;
		if (services["facebook"].loggedin) {
			if (initRequest) {
				return rolodex.logoutService("facebook");
			}
			// Fetch credentials as soon as loggedin
			window.location.href = window.localStorage.callback + "?credentialsToken=" + services["facebook"].tokenUrl;
			return;
		} else {
			// Trigger login as soon as UI loads.
			return rolodex.loginService("facebook", true);
		}
	});

});
