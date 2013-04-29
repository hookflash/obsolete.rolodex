
const ASSERT = require("assert");
const WAITFOR = require("waitfor");


const DB_KEY_NS = "0";


function Services(rolodex) {
	var self = this;
	self.rolodex = rolodex;
	self.sessions = {};
}

Services.prototype.getForSessionID = function(sessionID, callback) {
	var self = this;
	if (self.sessions[sessionID]) {
		// TODO: Touch session to prevent timeout.
		return callback(null, self.sessions[sessionID]);
	}
	var session = new ServicesSession(self.rolodex, sessionID);
	// TODO: Timeout session after a while (so `self.sessions` does not grow indefinetely).
	self.sessions[sessionID] = session;
	return callback(null, session);
}


function ServicesSession(rolodex, id) {
	var self = this;
	self.rolodex = rolodex;
	self.id = id;
	self.services = {};
	function initService(serviceId) {
		function getContactsKey() {
			ASSERT.equal(typeof self.services[serviceId].userID, "string");
			return [
				self.rolodex.config.db.redis.prefix,
				":",
				DB_KEY_NS,
				":",
				"contacts",
				":",
				serviceId,
				":",
				self.services[serviceId].userID
			].join("");
		}

		var hidden = {
			contacts: {},
			load: function(callback) {
			    return self.rolodex.db.get(getContactsKey(), function (err, reply) {
			    	if (err) return callback(err);
			    	if (reply) {
			    		try {
			    			var data = JSON.parse(reply);
			    			self.services[serviceId].contacts = data.fetched;
			    			self.services[serviceId].contactsFetched = Object.keys(self.services[serviceId].contacts).length;
			    			self.services[serviceId].contactsDropped = data.dropped;
			    		} catch(err) {
			    			return callback(new Error("Error parsing redis response for key '" + getContactsKey() + "'"));
			    		}
			    	}
					return callback(null);
			    });
			},
			save: function(callback) {
				// TODO: Have records expire after some time for stale users (e.g. 1 month).
			    return self.rolodex.db.set(getContactsKey(), JSON.stringify({
			    	dropped: service.contactsDropped,
			    	fetched: self.services[serviceId].contacts
			    }), function (err, reply) {
			    	if (err) return callback(err);
					return callback(null);
			    });
			}
		};
		var service = Object.create(hidden);
		service.loggedin = false;
		service.fetching = false;
		service.userID = null;
		service.contactsTotal = 0;
		// When fetching contacts count, some services return a capped top number. This
		// flag is set until we have an exact count available by actually loading all contacts.
		service.contactsTotalCapped = false;
		service.contactsFetched = 0;
		// Some contacts are counted in total but no data is available due to
		// privary settings. This counter records these contacts so we can arrive
		// at `(service.contactsFetched + service.contactsDropped) === service.contactsTotal`
		service.contactsDropped = 0;
		service.authURL = [
			self.rolodex.config.routes.auth,
			"/",
			serviceId
		].join("");
		service.refetchURL = [
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

ServicesSession.prototype.getServices = function() {
	return this.services;
}

ServicesSession.prototype.getContacts = function() {
	var self = this;
	var contacts = {};
	for (var serviceId in self.services) {
		contacts[serviceId] = self.services[serviceId].contacts;
	}
	return contacts;
}


module.exports = Services;
