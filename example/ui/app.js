
define([
	"rolodex/client"
], function(ROLODEX) {

	var rolodex = new ROLODEX();

	rolodex.on("services.fetched", function(services) {
		function renderService(serviceId, service) {

			rolodex.getContacts(serviceId).then(function(contacts) {
				console.log("Contacts for", serviceId, contacts);
			});

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
					rolodex.refetchContacts(serviceId).then(function(data) {
						if (data.error) {
							var error = $("DIV.error", serviceHtml);
							error.removeClass("hidden");
							error.html(data.error.message);
							serviceHtml.addClass("error");
						}
					});
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

		rolodex.getContacts().then(function(contacts) {
			console.log("Contacts", contacts);
		});
	});

	rolodex.on("contacts.fetched", function(serviceId, contacts) {

		console.log("Contacts for", serviceId, contacts);

		// As a test get all contacts starting with [c|e|x]

		rolodex.getContacts(null, {
			nickname: /^[c|e|x]/,
			fn: /^[c|e|x]/
		}).then(function(contacts) {
			console.log("Contacts starting with [c|e|x]", contacts);
		});
		rolodex.getContacts(serviceId, {
			nickname: /^[c|e|x]/,
			fn: /^[c|e|x]/
		}).then(function(contacts) {
			console.log("Contacts for", serviceId, "starting with [c|e|x]", contacts);
		});

	});

	rolodex.on("contact.added", function(uid, info) {
		console.log("Contact added", uid, info);
	});

	rolodex.on("contact.removed", function(uid, info) {
		console.log("Contact removed", uid, info);
	});

});
