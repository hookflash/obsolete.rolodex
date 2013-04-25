
(function() {

	$(document).ready(function() {
		fetch();
	});

	function fetch() {

		function callback(err) {
			if (err) console.error(err);
		}

		return fetchServices(function(err, services) {
			if (err) return callback(err);

			syncServicesToDOM(services);

			return fetchContacts(function(err, contacts) {

console.log("contacts", contacts);

				return callback(null);
			});
		});
	}

	function syncServicesToDOM(services) {

		var fetching = false;

		$("#services").html("");

		for (var name in services) {

			if (services[name].fetching) {
				fetching = true;
			}

console.log("name", name, services[name]);

			var serviceHtml;
			if (services[name].loggedin) {

				serviceHtml = $("#service").clone();

			} else {

				serviceHtml = $("#service-auth").clone();
				var button = $("button", serviceHtml);
				button.html(button.html().replace("{name}", name));
				button.click(function() {
					window.location.replace(services[name].authURL);
				});
			}

			serviceHtml.attr("id", "service-" + name);
			serviceHtml.removeClass("hidden");
			serviceHtml.appendTo("#services");
		}

		if (fetching) {
			// Wait 5 seconds and fetch again.
			setTimeout(function() {
				fetch();
			}, 5 * 1000);
		}
	}

	function fetchServices(callback) {
		$.getJSON("/.openpeer-rolodex/services")
		 .done(function(data) {
		 	return callback(null, data);
		 })
		 .fail(callback);
	}


	function fetchContacts(callback) {
		$.getJSON("/.openpeer-rolodex/contacts")
		 .done(function(data) {
		 	return callback(null, data);
		 })
		 .fail(callback);
	}

})();
