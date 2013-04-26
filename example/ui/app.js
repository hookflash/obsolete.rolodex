
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

		for (var name in services) {

			if (services[name].fetching) {
				fetching = true;
			}

console.log("name", name, services[name]);

			var serviceHtml = null;

			if (services[name].loggedin) {

				serviceHtml = $("#service").clone();

				var html = serviceHtml.html();
				html = html.replace("{name}", name);
				html = html.replace("{fetched}", services[name].contactsFetched);
				html = html.replace("{total}", services[name].contactsTotal);
				serviceHtml.html(html);

				var button = $("button.refetch", serviceHtml);
				button.click(function() {
					$.get(services[name].refetchURL).done(function() {
						fetch();
					});
				});

				if (
					!services[name].fetching &&
					services[name].contactsTotal > 0 &&
					services[name].contactsFetched === services[name].contactsTotal
				) {
					serviceHtml.addClass("fetched");
				}

			} else {

				serviceHtml = $("#service-auth").clone();
				var button = $("button.login", serviceHtml);
				button.html(button.html().replace("{name}", name));
				button.click(function() {
					window.location.replace(services[name].authURL);
				});
			}

			serviceHtml.attr("id", "service-" + name);
			serviceHtml.removeClass("hidden");

			var existing = $("#service-" + name);
			if (existing.length === 1) {
				existing.replaceWith(serviceHtml);
			} else {
				serviceHtml.appendTo("#services");
			}
		}

		if (fetching) {
			// Wait 5 seconds and fetch again.
			setTimeout(function() {
				fetch();
			}, 2 * 1000);
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
