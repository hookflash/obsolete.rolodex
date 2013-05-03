
const ASSERT = require("assert");
const WAITFOR = require("waitfor");

const DB_KEY_NS = "19";


function Services(rolodex, options) {
	var self = this;
	self.rolodex = rolodex;
	self.options = options;

	rolodex.kickq.process([
		"fetch-for-service"
	], {
		concurrentJobs: 10
	}, function(jobItem, jobData, callback) {
		try {

			self.options.logger.debug("[rolodex][job:fetch-for-service] Running job:", jobItem);

			ASSERT.equal(typeof jobData.sessionID, "string");
			ASSERT.equal(typeof jobData.serviceId, "string");
			ASSERT.equal(typeof jobData.credentials, "object");

			return self.getForSessionID(jobData.sessionID, function(err, servicesSession) {
				if (err) throw err;
				return servicesSession._runFetchForService(jobData.serviceId, jobData.credentials, callback);				
			});

		} catch(err) {
			self.options.logger.error("[rolodex][job:fetch-for-service] Error initializing job:", err.stack);
			return callback(err.message);
		}
	});
}

Services.prototype.getForSessionID = function(sessionID, callback) {
	var self = this;
	var session = new ServicesSession(self.rolodex, sessionID, self.options);
	return session.load(function(err) {
		if (err) return callback(err);
		return callback(null, session);
	});
}


function ServicesSession(rolodex, sessionID, options) {
	var self = this;
	self.rolodex = rolodex;
	self.options = options;
	self.sessionID = sessionID;
	self.services = {};
	self.servicesLoaded = null;
	function initService(serviceId) {
		var hidden = {
			contacts: {},
			credentials: {},
			load: function(callback) {
			},
			save: function(callback) {
			}
		};
		var service = Object.create(hidden);
		service.loggedin = false;
		service.fetching = false;
		service.error = false;
		service.hCard = null;
		service.contactsTotal = 0;
		service.contactsFetched = 0;
		// Some contacts are counted in total but no data is available due to
		// privary settings. This counter records these contacts so we can arrive
		// at `(service.contactsFetched + service.contactsDropped) === service.contactsTotal`
		service.contactsDropped = 0;
		service.authURL = [
			(options.port === 443) ? "https" : "http",
			"://",
			options.hostname,
			(options.port && options.port !== 443 && options.port !== 80) ? ":" + options.port : "",
			self.rolodex.config.routes.auth,
			"/",
			serviceId
		].join("");
		service.logoutURL = [
			(options.port === 443) ? "https" : "http",
			"://",
			options.hostname,
			(options.port && options.port !== 443 && options.port !== 80) ? ":" + options.port : "",
			self.rolodex.config.routes.logout,
			"/",
			serviceId
		].join("");
		service.refetchURL = [
			(options.port === 443) ? "https" : "http",
			"://",
			options.hostname,
			(options.port && options.port !== 443 && options.port !== 80) ? ":" + options.port : "",
			self.rolodex.config.routes.refetch,
			"/",
			serviceId
		].join("");
		self.services[serviceId] = service;
	}
	for (var serviceId in self.rolodex.provisionedServices) {
		initService(serviceId);
	}
}

ServicesSession.prototype._getDBKey = function() {
	return [
		this.rolodex.config.db.redis.prefix,
		DB_KEY_NS,
		":",
		"services",
		":",
		this.sessionID
	].join("");
}

ServicesSession.prototype.load = function(callback) {
	var self = this;
    return self.rolodex.db.get(self._getDBKey(), function (err, reply) {
    	if (err) return callback(err);
    	if (reply) {
    		try {
    			self.servicesLoaded = reply;
    			var data = JSON.parse(reply);
    			for (var serviceId in data) {
    				if (self.services[serviceId]) {
		    			for (var key in data[serviceId]) {
		    				if (self.services[serviceId].hasOwnProperty(key)) {
			    				self.services[serviceId][key] = data[serviceId][key];
			    			} else {
			    				self.services[serviceId].__proto__[key] = data[serviceId][key];
			    			}
		    			}
	    			}
    			}
    		} catch(err) {
    			return callback(new Error("Error parsing redis response for key '" + self._getDBKey() + "'"));
    		}
    	}
		return callback(null);
    });
}

ServicesSession.prototype.save = function(changes, callback) {
	var self = this;
	if (typeof changes === "function" && typeof callback === "undefined") {
		callback = changes;
		changes = null;
	}
	function save(callback) {
		// TODO: Have records expire after some time for stale users (e.g. 1 month).
		var services = {};
		for (var serviceId in self.services) {
			services[serviceId] = {};
			for (var key in self.services[serviceId]) {
				if (key !== "authURL" && key !== "logoutURL" && key !== "refetchURL") {
					if (changes && changes[serviceId] && typeof changes[serviceId][key] !== "undefined") {
						services[serviceId][key] = changes[serviceId][key];
					} else {
						services[serviceId][key] = self.services[serviceId][key];
					}
				}
			}
			for (var key in self.services[serviceId].__proto__) {
				if (key !== "contacts") {
					if (changes && changes[serviceId] && typeof changes[serviceId][key] !== "undefined") {
						services[serviceId][key] = changes[serviceId][key];
					} else {
						services[serviceId][key] = self.services[serviceId].__proto__[key];
					}
				}
			}		
		}
		services = JSON.stringify(services);
		if (services === self.servicesLoaded) {
			return callback(null);		
		}
	    return self.rolodex.db.get(self._getDBKey(), function (err, reply) {
	    	if (err) return callback(err);
	    	if (reply && reply !== self.servicesLoaded) {
	    		return callback(new Error("Could not save to DB as DB value changed from what we originally loaded."));
	    	}
		    return self.rolodex.db.set(self._getDBKey(), services, function (err, reply) {
		    	if (err) return callback(err);
		    	self.servicesLoaded = services;
				return callback(null);
		    });
		});
	}
	if (changes) {
		return self.load(function(err) {
			if (err) return callback(err);
			return save(callback);
		});
	}
	return save(callback);
}

ServicesSession.prototype.getServices = function() {
	return this.services;
}

ServicesSession.prototype._getContactsKey = function(serviceId) {
	return [
		this.rolodex.config.db.redis.prefix,
		DB_KEY_NS,
		":",
		"contacts",
		":",
		this.services[serviceId].hCard.uid
	].join("");
}

ServicesSession.prototype.loadContactsForService = function(serviceId, callback) {
	var self = this;
	if (!self.services[serviceId].hCard) return callback(null);
    return self.rolodex.db.get(self._getContactsKey(serviceId), function (err, reply) {
    	if (err) return callback(err);
    	if (reply) {
    		try {
    			var data = JSON.parse(reply);
    			for (var contactId in data.fetched) {
	    			self.services[serviceId].contacts[contactId] = data.fetched[contactId];
	    		}
    			self.services[serviceId].contactsFetched = Object.keys(self.services[serviceId].contacts).length;
    			self.services[serviceId].contactsDropped = data.dropped;
    		} catch(err) {
    			return callback(new Error("Error parsing redis response for key '" + self._getContactsKey(serviceId) + "'"));
    		}
    	}
		return callback(null);
    });
}

ServicesSession.prototype.saveContactsForService = function(serviceId, callback) {
	var self = this;
	// TODO: Have records expire after some time for stale users (e.g. 1 month).
    return self.rolodex.db.set(self._getContactsKey(serviceId), JSON.stringify({
    	dropped: self.services[serviceId].contactsDropped,
    	fetched: self.services[serviceId].contacts
    }), function (err, reply) {
    	if (err) return callback(err);
		return callback(null);
    });
}

ServicesSession.prototype.getContacts = function(onlyServiceId, callback) {
	var self = this;
	var contacts = {};
	var waitfor = WAITFOR.parallel(function(err) {
		if (err) return callback(err);
		if (onlyServiceId) {
			return callback(null, contacts[onlyServiceId] || {});
		}
		return callback(null, contacts);
	});
	for (var serviceId in self.services) {
		waitfor(serviceId, function(serviceId, done) {
			return self.loadContactsForService(serviceId, function(err) {
				if (err) return done(err);
				contacts[serviceId] = self.services[serviceId].contacts;
				return done(null);
			});
		});
	}
	return waitfor();
}

ServicesSession.prototype.loginService = function(serviceId, credentials, callback) {
	var self = this;
	var service = self.services[serviceId];
	service.loggedin = true;
	service.__proto__.credentials = credentials;
	if (
		service.hCard &&
		service.contactsTotal > 0 &&
		service.contactsFetched > 0 &&
		(service.contactsFetched + service.contactsDropped) === service.contactsTotal
	) {
		// Looks like we are all up to date.
		return self.save(callback);
	}
	// Looks like we need to fetch.
	return self.fetchForService(serviceId, function(err) {
		if (err) return callback(err);
		return self.save(callback);
	});
}

ServicesSession.prototype.logoutService = function(serviceId, callback) {
	var self = this;
	var service = self.services[serviceId];
	service.loggedin = false;
	return self.save(callback);
}

ServicesSession.prototype.fetchForService = function(serviceId, callback) {
	var self = this;
	var service = self.services[serviceId];
	function scheduleFetch(callback) {
		return self.rolodex.kickq.create("fetch-for-service", {
			sessionID: self.sessionID,
			serviceId: serviceId,
			credentials: service.credentials
		}, {
			delay: 1000	// Delay one second to allow our save to go through before job queue picks it up.
		}, function(err, jobItem) {
			if (err) return callback(err);
			service.fetching = jobItem.id;
			service.error = false;
			service.contactsFetched = 0;
			service.contactsDropped = 0;
			return self.save(callback);
		});
	}
	if (service.fetching) {
		return self.rolodex.kickq.get(service.fetching, function(err, jobItem) {
			if (err) return callback(err);
			if (jobItem && jobItem.state !== "success" && jobItem.state !== "fail") {
				// We already have a job running so we don't schedule another one for now.
				return callback(null);
			}
			return scheduleFetch(callback);
		});
	}
	return scheduleFetch(callback);
}

ServicesSession.prototype._runFetchForService = function(serviceId, credentials, callback) {
	var self = this;

	function Service(data) {
		this._data = {};
		for (var key in data) {
			this._data[key] = data[key];
		}
		this._changes = {};
	}
	Service.prototype.set = function(key, value) {
		this._changes[key] = value;
	}
	Service.prototype.get = function(key) {
		if (typeof this._changes[key] !== "undefined") {
			return this._changes[key];
		}
		return this._data[key];		
	}
	Service.prototype.clearChanges = function() {
		this._changes = {};
	}
	Service.prototype.formatChangesForService = function(serviceId) {
		var changes = {};
		changes[serviceId] = this._changes;
		return changes;
	}

	try {

		ASSERT.equal(typeof self.services[serviceId], "object");

		return self.loadContactsForService(serviceId, function(err) {
			if (err) return err;

			var service = new Service(self.services[serviceId]);

			return self.rolodex.provisionedServices[serviceId].fetchContacts(
				credentials,
				service,
				self.options,
				function(err) {
					if (err) {
						self.options.logger.error("[rolodex][job:fetch-for-service][" + serviceId + "] Error running job:", err.stack);
						service.clearChanges();
						service.set("error", err.message);
						service.set("fetching", false);
						service.set("contactsTotal", service.get("contactsFetched") + service.get("contactsDropped"));
						return self.save(service.formatChangesForService(serviceId), callback);
					}
					if ((service.get("contactsFetched") + service.get("contactsDropped")) !== service.get("contactsTotal")) {
						self.options.logger.warn("[rolodex][job:fetch-for-service][" + serviceId + "] `contactsFetched` (" + service.get("contactsFetched") + ") + `contactsDropped` (" + service.get("contactsDropped") + ") != `contactsTotal` (" + service.get("contactsTotal") + ")");
					}
					service.set("contactsTotal", service.get("contactsFetched") + service.get("contactsDropped"));
					self.services[serviceId].hCard = service.get("hCard");
					return self.saveContactsForService(serviceId, function(err) {
						if (err) return callback(err);
						service.set("error", false);
						service.set("fetching", false);
						return self.save(service.formatChangesForService(serviceId), callback);
					});
				}
			);
		});

	} catch(err) {
		return callback(err);
	}
}

module.exports = Services;
