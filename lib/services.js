
const ASSERT = require("assert");
const WAITFOR = require("waitfor");


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
	for (var serviceId in self.rolodex.provisionedServices) {

		function getContactsKey() {
			ASSERT.equal(typeof self.services[serviceId].username, "string");
			return [
				self.rolodex.config.db.redis.prefix,
				"contacts",
				":",
				serviceId,
				":",
				self.services[serviceId].username
			].join("");
		}

		var hidden = {
			contacts: {},
			load: function(callback) {
			    return self.rolodex.db.get(getContactsKey(), function (err, reply) {
			    	if (err) return callback(err);
			    	if (reply) {
			    		try {
			    			self.services[serviceId].contacts = JSON.parse(reply);
			    			self.services[serviceId].contactsFetched = Object.keys(self.services[serviceId].contacts).length;
			    		} catch(err) {
			    			return callback(new Error("Error parsing redis response for key '" + getContactsKey() + "'"));
			    		}
			    	}
					return callback(null);
			    });
			},
			save: function(callback) {
			    return self.rolodex.db.set(getContactsKey(), JSON.stringify(self.services[serviceId].contacts), function (err, reply) {
			    	if (err) return callback(err);
					return callback(null);
			    });
			}
		};
		var service = Object.create(hidden);
		service.loggedin = false;
		service.fetching = false;
		service.username = null;
		service.contactsTotal = 0;
		service.contactsFetched = 0;
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
