
define([
	"rolodex/eventemitter2",
	"rolodex/q"
], function(EVENTS, Q) {

	// Import globals.
	var JQUERY = $;
	var WINDOW = window;


	function Rolodex(options) {
		var self = this;
		self._options = options || {};
		self._options.baseURL = self._options.baseURL || "";
		self._routes = {
            services: "/.openpeer-rolodex/services",
            contacts: "/.openpeer-rolodex/contacts"
		};
		self._services = null;
		self._contacts = {};

		self._refetching = {};
		self._refetchingMonitorInterval = null;
	}

	Rolodex.prototype = Object.create(EVENTS.prototype);

	Rolodex.prototype.init = function() {
		var self = this;
		return self.getServices().then(function() {
			// TODO: Only fetch contacts if we need to.
			//		 We may already have all of them in local storage.
			return self.getContacts();
		});
	}

	function formatService(service) {
		var percent = Math.floor((service.contactsFetched / service.contactsTotal) * 100);
		if (service.contactsFetched === 0) percent = 0;
		if (percent === 100 && service.fetching) percent = 99;
		if (percent === 100 && service.contactsFetched < service.contactsTotal) percent = 99;
		service.percentFetched = percent;
	}

	Rolodex.prototype.getServices = function(forceFetch) {
		var self = this;
		if (self._services && !forceFetch) {
			return self._services;
		}
		var deferred = Q.defer();
		JQUERY.ajax({
			method: "GET",
			dataType: "json",
			url: self._options.baseURL + self._routes.services,
			xhrFields: {
                withCredentials: true
            },
            crossDomain: true
		}).done(function(services) {
			deferred.resolve(services);
			for (serviceId in services) {
				formatService(services[serviceId]);
				if (services[serviceId].fetching) {
					self._monitorRefetch(serviceId);
				}
			}
			self.emit("fetched.services", services);
		}).fail(function(err) {
			deferred.reject(err);
			self._services = null;
		});
		return (self._services = deferred.promise);
	}

	Rolodex.prototype.getContacts = function(serviceId, forceFetch) {
		var self = this;
		function fetch(serviceId) {
			var deferred = Q.defer();
			JQUERY.ajax({
				method: "GET",
				dataType: "json",
				url: self._options.baseURL + self._routes.contacts + ((!serviceId || serviceId==="*")?"":"/"+serviceId),
				xhrFields: {
	                withCredentials: true
	            },
	            crossDomain: true
			}).done(function(data) {
				deferred.resolve(data);
			}).fail(deferred.reject);
			return deferred.promise;
		}
		function getContactsFor(serviceId, forceFetch) {
			if (self._contacts[serviceId] && !forceFetch) {
				return self._contacts[serviceId];
			}
			return (self._contacts[serviceId] = fetch(serviceId).then(function(data) {
				self.emit("fetched.contacts", serviceId, data);
				return data;
			})).fail(function(err) {
				delete self._contacts[serviceId];
			});
		}
		if (serviceId) {
			return getContactsFor(serviceId, forceFetch);
		} else {
			return self.getServices().then(function(services) {
				if (Object.keys(self._contacts).length === 0) {
					var promises = {};
					for (var serviceId in services) {
						promises[serviceId] = Q.defer();
						self._contacts[serviceId] = promises[serviceId].promise;
					}
					fetch("*").then(function(data) {
						for (var serviceId in services) {
							promises[serviceId].resolve(data[serviceId]);
							self.emit("fetched.contacts", serviceId, data[serviceId]);
						}
					}).fail(function(err) {
						for (var serviceId in services) {
							promises[serviceId].reject(err);
							delete self._contacts[serviceId];
						}
					});
				}
				var contacts = {};
				var done = Q.resolve();
				function forService(serviceId) {
					done = Q.when(getContactsFor(serviceId), function(serviceContacts) {
						contacts[serviceId] = serviceContacts;
					});
				}
				for (var serviceId in services) {
					forService(serviceId);
				}
				return Q.when(done, function() {
					return contacts
				});
			});
		}
	}

	Rolodex.prototype.refetchContacts = function(serviceId) {
		var self = this;
		return self.getServices().then(function(services) {
			var deferred = Q.defer();
			JQUERY.get(services[serviceId].refetchURL).done(function() {
				self.getServices(true);
				self._monitorRefetch(serviceId);
				return deferred.resolve();
			}).fail(deferred.reject);
			return deferred.promise;
		});
	}

	Rolodex.prototype._monitorRefetch = function(serviceId) {
		var self = this;

		if (self._refetching[serviceId]) return;
		self._refetching[serviceId] = true;

		if (self._refetchingMonitorInterval) return;
		self._refetchingMonitorInterval = setInterval(function() {
			self.getServices(true).then(function(services) {
				for (var serviceId in services) {
					if (self._refetching[serviceId] && !services[serviceId].fetching) {
						delete self._refetching[serviceId];
						self.getContacts(serviceId, true);
					}
				}
				if (Object.keys(self._refetching).length === 0) {
					clearInterval(self._refetchingMonitorInterval);
					self._refetchingMonitorInterval = null;
				}
			});
		}, 2500);
	}

	Rolodex.prototype.loginService = function(serviceId) {
		var self = this;
		return self.getServices().then(function(services) {
			JQUERY("body").append(JQUERY("<form/>").attr({
				"action": services[serviceId].authURL,
				"method": "POST",
				"id": "rolodex-auth-form"
			}).append(JQUERY("<input/>").attr({
				"type": "hidden",
				"name": "successURL",
				"value": WINDOW.location.href.replace(/\?.*$/, "") + "?success"
			})).append(JQUERY("<input/>").attr({
				"type": "hidden",
				"name": "failURL",
				"value":  WINDOW.location.href.replace(/\?.*$/, "") + "?fail"
			}))).find("#rolodex-auth-form").submit();
		});
	}

	Rolodex.prototype.logoutService = function(serviceId) {
		var self = this;
		return self.getServices().then(function(services) {
			var deferred = Q.defer();
			JQUERY.get(services[serviceId].logoutURL).done(function() {
				self.getServices(true);
				return deferred.resolve();
			}).fail(deferred.reject);
			return deferred.promise;
		});
	}

	return Rolodex;
});
