
define([
	"rolodex/client"
], function(ROLODEX) {

	var rolodex = new ROLODEX();

	rolodex.on("fetched.services", function(services) {
		function renderService(serviceId, service) {

			console.log("Service Status", serviceId, services[serviceId]);

			var serviceHtml = null;

			if (service.loggedin) {

				serviceHtml = $("#service").clone();

				var html = serviceHtml.html();
				html = html.replace("{name}", serviceId);
				html = html.replace("{fetched}", service.contactsFetched);
				html = html.replace("{total}", service.contactsTotal);
				html = html.replace("{percent}", service.percentFetched);
				serviceHtml.html(html);

				var button = $("button.refetch", serviceHtml);
				button.click(function() {
					rolodex.refetchContacts(serviceId);
				});
				button = $("button.logout", serviceHtml);
				button.click(function() {
					rolodex.logoutService(serviceId);
				});

				if (service.error) {
					var error = $("DIV.error", serviceHtml);
					error.removeClass("hidden");
					error.html(service.error);
					serviceHtml.addClass("error");
				} else
				if (service.percentFetched === 100) {
					serviceHtml.addClass("fetched");
				}

			} else {

				serviceHtml = $("#service-auth").clone();
				var button = $("button.login", serviceHtml);
				button.html(button.html().replace("{name}", serviceId));
				button.click(function() {
					rolodex.loginService(serviceId);
				});
			}

			serviceHtml.attr("id", "service-" + serviceId);
			serviceHtml.removeClass("hidden");

			var existing = $("#service-" + serviceId);
			if (existing.length === 1) {
				existing.replaceWith(serviceHtml);
			} else {
				serviceHtml.appendTo("#services");
			}
		}
		for (var serviceId in services) {
			renderService(serviceId, services[serviceId]);
		}
	});

	rolodex.on("fetched.contacts", function(serviceId, contacts) {

		console.log("Contacts for", serviceId, contacts);

	});


	$(document).ready(function() {

		rolodex.init();

	});

});
