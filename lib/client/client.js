
define([
	"rolodex/eventemitter2",
	"rolodex/q",
	"rolodex/jquery.indexeddb"
], function(EVENTS, Q, DB) {

	// Import globals.
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
		self._peerContact = null;

		self._refetching = {};
		self._refetchingMonitorInterval = null;

		// Attach `indexedDB` to jquery.
		DB(WINDOW.$);

		// @see https://github.com/axemclion/jquery-indexeddb/blob/gh-pages/docs/README.md
		self._db = $.indexedDB("openpeer-rolodex", { 
		    "version" : 1,
		    "upgrade" : function(transaction){
		    },
		    "schema" : {
		        "1" : function(transaction) {
					var contactsStore = transaction.createObjectStore("contacts", {
					    "autoIncrement": false,
					    "keyPath": "uid"
					});
		        }
		    }
		});

		var deferred = Q.defer();
		self._db.fail(function(err, event) {
			return deferred.reject(err);
		});
		self._db.done(function(db, event) {
			return deferred.resolve();
		});
		self._ready = deferred.promise;

		// Fetch services and contacts in background.
		setTimeout(function() {
			self.getServices().then(function() {
				self.getContacts("*", null, true);
			}).fail(function(err) {
				console.error("[rolodex]", err.stack);
			});
		}, 0);
	}

	Rolodex.prototype = Object.create(EVENTS.prototype);

	// TODO: Deprecate.
	Rolodex.prototype.init = function() {
		return Q.resolve();
	}

	function formatService(service) {
		var percent = Math.floor((service.contactsFetched / service.contactsTotal) * 100);
		if (service.contactsFetched === 0) percent = 0;
		if (percent === 100 && service.fetching) percent = 99;
		if (percent === 100 && service.contactsFetched < service.contactsTotal) percent = 99;
		service.percentFetched = percent;
	}

	Rolodex.prototype.getPeerContact = function() {
		if (!this._peerContact) {
			throw new Error("Cannot return peer contact ID. It has not yet been set!");
		}
		return this._peerContact;
 	}

	Rolodex.prototype.getServices = function(forceFetch) {
		var self = this;
		if (self._services && !forceFetch) {
			return self._services;
		}
		return self._ready.then(function() {
			var deferred = Q.defer();
			WINDOW.$.ajax({
				method: "POST",
				dataType: "json",
				url: self._options.baseURL + self._routes.services,
				xhrFields: {
	                withCredentials: true
	            },
	            crossDomain: true
			}).done(function(services) {
				deferred.resolve(services);
				for (serviceId in services) {
					if (services[serviceId].hCard && services[serviceId].hCard.peerContact) {
						self._peerContact = services[serviceId].hCard.peerContact;
					}
					formatService(services[serviceId]);
					if (services[serviceId].fetching) {
						self._monitorRefetch(serviceId);
					}
				}
				self.emit("services.fetched", services);
				// TODO: Deprecate.
				self.emit("fetched.services", services);
			}).fail(function(err) {
				deferred.reject(err);
				self._services = null;
			});
			return (self._services = deferred.promise);
		});
	}

	Rolodex.prototype.getContact = function(uid) {
		var self = this;
		// TODO: Make this more efficient.
		if (/^peer:\/\//.test(uid)) {
			return self.getContacts("*", {
				peerContact: uid
			}).then(function(contacts) {
				if (!contacts || Object.keys(contacts).length === 0) return false;
				for (var serviceId in contacts) {
					for (var contactId in contacts[serviceId]) {
						return contacts[serviceId][contactId];
					}
				}
				return false;
			});
		} else {
			var uidParts = uid.split(":");
			return self.getContacts(uidParts[0]).then(function(contacts) {
				if (!contacts[uidParts[1]]) return false;
				return contacts[uidParts[1]];
			});
		}
	}

	Rolodex.prototype.getContacts = function(serviceId, filter, forceFetch) {
		var self = this;
		serviceId = ((!serviceId || serviceId === "*") ? false : serviceId);
		function fetchFromServer(serviceId) {
			function fetchFromDB() {
				var deferred = Q.defer();
				var transaction = self._db.transaction(["contacts"]);
				transaction.fail(function(event) {
					console.error("[rolodex]", event);
					return deferred.reject(new Error("Transaction failed due to: " + event.type));
				});
				var contacts = {};
				transaction.done(function(event) {
					return deferred.resolve(contacts);
				});
				transaction.progress(function(transaction) {
					var contactsStore = transaction.objectStore("contacts");
					contactsStore.each(function(item) {
						if (serviceId) {
							if (item.value.service === serviceId) {
								contacts[item.value.uid.split(":")[1]] = item.value;
							}
						} else {
							if (!contacts[item.value.service]) {
								contacts[item.value.service] = {};
							}
							contacts[item.value.service][item.value.uid.split(":")[1]] = item.value;
						}
					});
				});
				return deferred.promise;
			}
			function doFetchFromServer() {
				var deferred = Q.defer();
				WINDOW.$.ajax({
					method: "POST",
					dataType: "json",
					url: self._options.baseURL + self._routes.contacts + ((serviceId) ? "/"+serviceId : ""),
					xhrFields: {
		                withCredentials: true
		            },
		            crossDomain: true
				}).done(function(data) {
					function syncContactsToDB(serviceId, contacts) {
						var deferred = Q.defer();
						var transaction = self._db.transaction(["contacts"]);
						transaction.fail(function(event) {
							console.error("[rolodex]", event);
							return deferred.reject(new Error("Transaction failed due to: " + event.type));
						});
						transaction.done(function(event) {
							return deferred.resolve();
						});
						transaction.progress(function(transaction) {
							var contactsStore = transaction.objectStore("contacts");
							var newContacts = {};
							for (var contactId in contacts) {
								newContacts[contacts[contactId].uid] = contacts[contactId];
								newContacts[contacts[contactId].uid].service = serviceId;
							}
							contactsStore.each(function(item) {
								if (newContacts[item.key]) {
									// TODO: Compare if different and emit `contact.updated` event.
									item.update(newContacts[item.key]);
									delete newContacts[item.key];
								} else
								if (item.value.service === serviceId) {
									self.emit("contact.removed", item.key, item.value);
									item.delete();
								}
							}).done(function() {
								for (var contactId in newContacts) {
									contactsStore.put(newContacts[contactId]);
									self.emit("contact.added", contactId, newContacts[contactId]);
								}
							});
						});
						return deferred.promise;
					}
					var done = null;
					if (serviceId) {
						done = syncContactsToDB(serviceId, data);
					} else {
						done = Q.resolve();
						for (var contactServiceId in data) {
							function sync(contactServiceId) {
								done = Q.when(done, function() {
									return syncContactsToDB(contactServiceId, data[contactServiceId]);
								});
							}
							sync(contactServiceId);
						}
					}
					Q.when(done, function() {
						return deferred.resolve(data);
					}, deferred.reject);
				}).fail(deferred.reject);
				return deferred.promise;
			}
			return self._ready.then(function() {
				if (forceFetch) {
					return doFetchFromServer();
				}
				return fetchFromDB().then(function(contacts) {
					return self.getServices().then(function(services) {
						// If no contacts in DB we schedule a fetch from the server if logged in.
						if (serviceId) {
							if (services[serviceId].loggedin && Object.keys(contacts).length === 0) {
								return doFetchFromServer();
							}
						} else {
							var doFetch = false;
							for (var contactServiceId in services) {
								if (services[contactServiceId].loggedin && Object.keys(contacts[contactServiceId] || {}).length === 0) {
									doFetch = true;
								}
							}
							if (doFetch) {
								return doFetchFromServer();
							}
						}
						return contacts;
					});
				});
			});
		}
		function getContactsFor(serviceId, forceFetch) {
			return Q.fcall(function() {
				if (self._contacts[serviceId] && !forceFetch) {
					return self._contacts[serviceId];
				}
				return (self._contacts[serviceId] = fetchFromServer(serviceId).then(function(data) {
					self.emit("contacts.fetched", serviceId, data);
					// TODO: Deprecate.
					self.emit("fetched.contacts", serviceId, data);
					return data;
				})).fail(function(err) {
					delete self._contacts[serviceId];
				});
			}).then(function(contacts) {
				if (!filter) return contacts;
				var filtered = {};
				for (var contactId in contacts) {
					var matched = false;
					for (var property in filter) {
						if (matched) break;
						if (contacts[contactId][property]) {
							if (typeof filter[property] === "string" && filter[property] === contacts[contactId][property]) {
								matched = true;
							} else
							if (filter[property].test(contacts[contactId][property])) {
								matched = true;
							}
						}
					}
					if (matched) {
						filtered[contactId] = contacts[contactId];
					}
				}
				return filtered;
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
					fetchFromServer(null).then(function(data) {
						for (var serviceId in services) {
							promises[serviceId].resolve(data[serviceId]);
							self.emit("contacts.fetched", serviceId, data[serviceId]);
							// TODO: Deprecate.
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
			WINDOW.$.ajax({
				method: "POST",
				dataType: "json",
				url: services[serviceId].refetchURL,
				xhrFields: {
	                withCredentials: true
	            },
	            crossDomain: true
			}).done(function(data) {
				if (data && data.fetching) {
					self.getServices(true);
					self._monitorRefetch(serviceId);
				}
				return deferred.resolve(data);
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
						self.getContacts(serviceId, null, true);
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
			WINDOW.$("body").append(WINDOW.$("<form/>").attr({
				"action": services[serviceId].authURL,
				"method": "POST",
				"id": "rolodex-auth-form"
			}).append(WINDOW.$("<input/>").attr({
				"type": "hidden",
				"name": "successURL",
				"value": WINDOW.location.href.replace(/\?.*$/, "") + "?success"
			})).append(WINDOW.$("<input/>").attr({
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
			WINDOW.$.ajax({
				method: "POST",
				url: services[serviceId].logoutURL,
				xhrFields: {
	                withCredentials: true
	            },
	            crossDomain: true
			}).done(function() {
				self.getServices(true);
				return deferred.resolve();
			}).fail(deferred.reject);
			return deferred.promise;
		});
	}

	return Rolodex;
});
